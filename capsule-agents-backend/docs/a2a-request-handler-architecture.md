# A2A Request Handler Architecture

## Overview

The `CapsuleAgentA2ARequestHandler` is the core component that implements the Agent-to-Agent (A2A) protocol for handling agent communication. It orchestrates message processing, task execution, artifact generation, and status updates.

## Core Entry Points

### 1. `sendMessage(params)` → `Promise<Message | Task>`

- **Purpose**: Non-streaming synchronous message handling
- **Returns**: Complete Task with artifacts or direct Message response
- **Use Case**: When client doesn't need real-time streaming updates

### 2. `sendMessageStream(params)` → `AsyncGenerator<Task | Message | StatusUpdate | ArtifactUpdate>`

- **Purpose**: Streaming message handling with real-time updates
- **Yields**: Progressive events as they occur (task creation, status updates, artifact chunks)
- **Use Case**: When client needs live feedback during task execution

## Three-Stage Processing Flow

### Stage 1: Initial Routing

**Purpose**: Determine if request needs task creation or can be answered directly

**Process**:

1. Save user message to database
2. Call `handleInitialRouting()` which uses LLM to decide:
   - Simple question → Direct message response (skip to return)
   - Complex request needing tools → Create task (proceed to Stage 2)

**Decision Tool**:

```typescript
tools: {
  createTask: tool({
    description:
      "Create a task for complex requests requiring tools/multi-step processing",
  })
}
```

**Outcome**:

- If LLM calls `createTask`: `shouldCreateTask = true`
- Otherwise: Return direct message response immediately

---

### Stage 2: Task Creation & Execution

**Purpose**: Execute the task with full tool access and streaming status updates

**Setup**:

```typescript
// Core tracking structures
const currentTaskRef = { current: Task | null }
const artifactResultRef = { current: ArtifactDetails | null }
const artifactStreamStates = Map<toolCallId, ArtifactState>
const eventUpdateQueue = TaskEmitUnion[]
```

**Process**:

1. **Task Creation**
   - Create task in database with "submitted" state
   - Add user message to task history
   - Emit initial task event

2. **Transition to Working**
   - Update task state to "working"
   - Emit status update event

3. **Start Background Status Updates**
   - `statusUpdateService.startStatusUpdates()` begins generating periodic status messages
   - Status messages generated every 5 seconds using LLM
   - Recent status texts loaded from DB to avoid repetition

4. **Execute LLM Stream**
   ```typescript
   Vercel.streamText({
     model,
     messages,
     tools: allTools,
     onStepFinish: createOnStepFinishHandler(...),
     // Handles tool execution and artifact detection
   })
   ```

5. **Event Orchestration**
   - `orchestrateStreamEvents()` processes the stream
   - Listens for `tool-input-delta` events
   - If artifact tool detected: streams artifact updates in real-time
   - Interleaves artifact events with queued status updates
   - **Key**: Artifacts only emitted ONCE during this phase

6. **Artifact Detection (onStepFinish)**
   - After each step, `extractArtifactFromStepResult()` checks for artifact creation
   - If detected:
     - Stops status update service
     - Captures artifact details in `artifactResultRef`
   - Artifact state synchronized via `artifactStreamStates` Map

7. **Message Persistence (onFinish)**
   - When stream completes, `persistStreamMessages()` saves all new messages
   - Updates task state if not cancelled
   - Cleans up abort controllers

---

### Stage 3: Artifact Persistence

**Purpose**: Ensure artifact exists and persist to database

**Two Paths**:

**Path A: Natural Artifact** (LLM called `createArtifact` tool)

```typescript
if (artifactResultRef.current) {
  // Artifact was already streamed in Stage 2
  // Just persist to database
  taskService.createArtifact(task, artifactDetails)
}
```

**Path B: Forced Artifact** (No artifact created)

```typescript
else {
  // Force LLM to generate artifact
  const { streamResult, artifactStreamStates } = forceArtifactGeneration(task, contextId)

  // Stream the forced artifact (using same processArtifactStream method)
  for await (const event of processArtifactStream(task, streamResult, states)) {
    yield event  // Emit artifact chunks
  }

  // Persist to database
  taskService.createArtifact(task, artifactState)
}
```

**Final Step**: Mark task as "completed" and emit final status

---

## Key Components & Methods

### Artifact Streaming Pipeline

#### `processArtifactStream(task, streamResult, artifactStreamStates)`

**Unified artifact streaming for both natural and forced artifacts**

Process:

1. Listen to `streamResult.fullStream` events
2. On `tool-input-start`: Initialize artifact state with unique ID
3. On `tool-call`: Update artifact metadata (name, description)
4. On `tool-input-delta`:
   - Append chunk to artifact content
   - Yield `TaskArtifactUpdateEvent` with accumulated content
5. Result: Progressive artifact emission chunk-by-chunk

#### `forceArtifactGeneration(task, contextId)`

**Force artifact when LLM doesn't create one naturally**

Process:

1. Create new `streamText()` call with forced tool choice:
   ```typescript
   toolChoice: { type: "tool", toolName: "createArtifact" }
   ```
2. Return `{ streamResult, artifactStreamStates }` for processing by `processArtifactStream()`
3. Note: Uses same streaming mechanism as natural artifacts (unified approach)

### Status Update System

#### `StatusUpdateService.startStatusUpdates(taskId, ...)`

**Background status generation**

Process:

1. Runs every 5 seconds (configurable interval)
2. Loads recent status texts from database: `getRecentStatusTexts(taskId, 5)`
3. Generates new status using LLM:
   ```typescript
   generateText({
     messages: conversationHistory,
     prompt: "Generate SHORT status update (max 50 chars)
              Previous statuses (don't repeat): [recent]"
   })
   ```
4. Persists status message to database with `metadata.kind = "status-message"`
5. Emits `TaskStatusUpdateEvent`
6. Stops automatically when artifact detected

### Event Orchestration

#### `orchestrateStreamEvents(streamResult, task, artifactStates, statusQueue, shouldStreamArtifacts)`

**Unified event emission replacing multiple queue drain loops**

Process:

```typescript
if (shouldStreamArtifacts) {
  for await (artifact of processArtifactStream(...)) {
    yield artifact
    // Drain status queue after each artifact
    while (statusQueue.length > 0) yield statusQueue.shift()
  }
} else {
  // Just consume stream and emit status updates
  for await (_ of streamResult.fullStream) {
    while (statusQueue.length > 0) yield statusQueue.shift()
  }
}
// Final drain
while (statusQueue.length > 0) yield statusQueue.shift()
```

Benefits:

- Single point of event emission
- No timing dependencies or `setTimeout` hacks
- Guaranteed ordering: artifacts before their status updates

### Message Persistence

#### `persistStreamMessages(messages, contextId, originalCount, taskId?)`

**Shared persistence for both streaming and non-streaming**

Process:

1. Extract new messages: `messages.slice(originalMessageCount)`
2. Ensure each has an ID (generate if missing)
3. Upsert to database via `vercelService.upsertMessage()`
4. Associate with task if taskId provided

---

## State Management

### Single Source of Truth: `artifactResultRef`

**Before Refactor** (3 separate tracking mechanisms):

- `artifactStreamStates` Map
- `artifactCreatedRef` boolean
- `artifactDetailsRef` object

**After Refactor** (1 unified ref):

```typescript
const artifactResultRef: {
  current: {
    artifactId: string
    name: string
    description?: string
    content: string
  } | null
} = { current: null }
```

**Population**:

- Set by `onStepFinish` handler when artifact detected
- Uses `extractArtifactFromStepResult()` to parse tool results
- Matched with streaming state via toolCallId

---

## Critical Design Decisions

### 1. No Double Emission

**Problem**: Previously artifacts were emitted during `tool-input-delta` AND re-emitted in Stage 3
**Solution**: Artifacts only emitted during Stage 2 stream processing. Stage 3 ONLY persists.

### 2. Unified Streaming Path

**Problem**: Natural artifacts and forced artifacts used completely different streaming code
**Solution**: Both use `processArtifactStream()` - forced generation returns `streamResult` that feeds into same pipeline

### 3. Database-Backed Status History

**Problem**: Status texts tracked in memory, lost on restart
**Solution**: Load recent statuses from database via `getRecentStatusTexts(taskId)`. Single source of truth.

### 4. No Timing Hacks

**Problem**: Used `setTimeout(100ms)` to wait for async callbacks
**Solution**: Proper stream consumption with `for await` loops. Events processed in order.

---

## Data Flow Diagram

```
User Message
    ↓
┌─────────────────────────────────────┐
│  Stage 1: Initial Routing           │
│  ├─ Save message to DB              │
│  └─ LLM decides: Task or Response?  │
└─────────────────────────────────────┘
    ↓ (if createTask)
┌─────────────────────────────────────┐
│  Stage 2: Task Execution            │
│  ├─ Create task (state: submitted)  │
│  ├─ Emit task event                 │
│  ├─ Transition to "working"         │
│  ├─ Start status updates (async)    │
│  ├─ Execute LLM stream with tools   │
│  │   └─ orchestrateStreamEvents()   │
│  │       ├─ processArtifactStream() │ ← Emits artifacts
│  │       └─ Drain status queue      │ ← Emits status updates
│  └─ persistStreamMessages()         │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  Stage 3: Artifact Persistence      │
│  ├─ If artifact exists: persist it  │
│  ├─ Else: force generation + stream │
│  ├─ Persist to artifacts table      │
│  └─ Emit "completed" status         │
└─────────────────────────────────────┘
```

---

## Database Schema

### Messages Table

```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  context_id TEXT NOT NULL,
  task_id TEXT,              -- NULL for non-task messages
  role TEXT NOT NULL,         -- 'user' | 'agent'
  parts TEXT NOT NULL,        -- JSON array of message parts
  metadata TEXT,              -- JSON with optional 'kind' field
  timestamp INTEGER NOT NULL
)
```

**Special Metadata**:

- `{ kind: "status-message" }` - Generated status updates
- Used for filtering: `WHERE json_extract(metadata, '$.kind') = 'status-message'`

### Artifacts Table

```sql
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  parts TEXT NOT NULL,        -- JSON array (usually single text part)
  created_at INTEGER NOT NULL
)
```

### Tasks Table

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  context_id TEXT NOT NULL,
  status TEXT NOT NULL,       -- JSON TaskStatus object
  history TEXT,               -- JSON array of history events
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)
```

---

## Error Handling

### Abort Controllers

- Created per task: `taskAbortControllers.set(taskId, controller)`
- Allows task cancellation via `cancelTask()`
- Cleanup on completion or error

### Error Flow

```typescript
catch (error) {
  if (currentTaskRef.current) {
    // Clean up
    taskAbortControllers.delete(taskId)
    statusUpdateService.stopStatusUpdates(taskId)

    // Mark failed
    transitionState(task, "failed")
    yield failedStatus
  }
  throw error
}
```

---

## Performance Optimizations

1. **Stream Processing**: Events processed as they arrive, no buffering
2. **Lazy Artifact Generation**: Only force if LLM didn't create naturally
3. **Async Status Updates**: Run in background, don't block main flow
4. **Database Queries**: Load only recent status texts (limit 5-10)
5. **MCP Server Disposal**: Proper cleanup with `await using` syntax

---

## Testing Considerations

### Key Test Scenarios

1. **Direct Message Response**
   - Simple question → No task created
   - Should return Message immediately

2. **Task with Natural Artifact**
   - LLM calls `createArtifact` tool
   - Should emit artifact chunks via `tool-input-delta`
   - Should NOT re-emit in Stage 3
   - Should persist once to database

3. **Task with Forced Artifact**
   - LLM doesn't call artifact tool
   - Should force generation in Stage 3
   - Should stream forced artifact
   - Should persist to database

4. **Task Cancellation**
   - Call `cancelTask(taskId)`
   - Should abort stream
   - Should update state to "canceled"
   - Should not override with "completed"

5. **Status Updates**
   - Should generate every 5 seconds
   - Should stop when artifact detected
   - Should not repeat recent status texts
   - Should persist to database

---

## Future Improvements

1. **Incremental Artifact Persistence**: Save artifact chunks as they arrive instead of waiting for completion
2. **Artifact Compression**: Compress large artifacts in database
3. **Artifact Chunking**: Support multi-part artifacts
4. **Status Update Batching**: Batch multiple status updates to reduce database writes
5. **Resumable Streams**: Support resuming interrupted streams via `resubscribe()`

---

## Related Files

- `src/services/task.service.ts` - Task lifecycle management
- `src/services/status-update.service.ts` - Background status generation
- `src/services/vercel.service.ts` - Message format conversion
- `src/repositories/message.repository.ts` - Message persistence & status queries
- `src/repositories/artifact.repository.ts` - Artifact persistence
- `src/repositories/task.repository.ts` - Task persistence
- `src/lib/artifact-tool.ts` - Artifact tool definition
- `src/lib/default-prompts.ts` - System prompt construction
