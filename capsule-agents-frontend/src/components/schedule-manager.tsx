"use client"

import { useEffect, useState } from "react"
import { Button } from "./ui/button.tsx"
import { Input } from "./ui/input.tsx"
import { Label } from "./ui/label.tsx"
import { Textarea } from "./ui/textarea.tsx"
import { Switch } from "./ui/switch.tsx"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table.tsx"
import { Badge } from "./ui/badge.tsx"
import { Clock, Edit, Info, Loader2, Play, Plus, Trash } from "lucide-react"
import { toast } from "sonner"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.tsx"
import { CronBuilder } from "./cron-builder.tsx"
import { BackoffConfig } from "./backoff-config.tsx"
import {
  createSchedule,
  deleteSchedule,
  getSchedules,
  runScheduleNow,
  Schedule,
  ScheduleInput,
  toggleSchedule,
  updateSchedule,
} from "../lib/api.ts"

export default function ScheduleManager() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(
    null,
  )
  const [isSaving, setIsSaving] = useState(false)
  const [runningScheduleId, setRunningScheduleId] = useState<string | null>(
    null,
  )

  // Form state
  const [name, setName] = useState("")
  const [prompt, setPrompt] = useState("")
  const [cronExpression, setCronExpression] = useState("0 9 * * *")
  const [backoffEnabled, setBackoffEnabled] = useState(false)
  const [backoffSchedule, setBackoffSchedule] = useState<number[]>([
    1000,
    5000,
    10000,
  ])

  useEffect(() => {
    fetchSchedules()
  }, [])

  const fetchSchedules = async () => {
    try {
      setIsLoading(true)
      const data = await getSchedules()
      setSchedules(data)
    } catch (error) {
      console.error("Failed to fetch schedules:", error)
      toast.error("Failed to load schedules")
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateNew = () => {
    setEditingSchedule(null)
    setName("")
    setPrompt("")
    setCronExpression("0 9 * * *")
    setBackoffEnabled(false)
    setBackoffSchedule([1000, 5000, 10000])
    setShowDialog(true)
  }

  const handleEdit = (schedule: Schedule) => {
    setEditingSchedule(schedule)
    setName(schedule.name)
    setPrompt(schedule.prompt)
    setCronExpression(schedule.cronExpression)
    setBackoffEnabled(schedule.backoffEnabled)
    setBackoffSchedule(schedule.backoffSchedule || [1000, 5000, 10000])
    setShowDialog(true)
  }

  const handleSave = async () => {
    if (!name.trim() || !prompt.trim() || !cronExpression.trim()) {
      toast.error("Please fill in all required fields")
      return
    }

    setIsSaving(true)

    try {
      const input: ScheduleInput = {
        name: name.trim(),
        prompt: prompt.trim(),
        cronExpression: cronExpression.trim(),
        enabled: editingSchedule ? editingSchedule.enabled : true,
        backoffEnabled,
        backoffSchedule: backoffEnabled ? backoffSchedule : undefined,
      }

      if (editingSchedule) {
        // Check if cron expression changed
        const cronChanged =
          input.cronExpression !== editingSchedule.cronExpression
        const backoffChanged =
          input.backoffEnabled !== editingSchedule.backoffEnabled ||
          JSON.stringify(input.backoffSchedule) !==
            JSON.stringify(editingSchedule.backoffSchedule)

        await updateSchedule(editingSchedule.id, input)

        if (cronChanged || backoffChanged) {
          toast.success("Schedule updated", {
            description:
              "Server restart required for timing changes to take effect",
            duration: 5000,
          })
        } else {
          toast.success("Schedule updated successfully")
        }
      } else {
        await createSchedule(input)
        toast.success("Schedule created successfully")
      }

      setShowDialog(false)
      fetchSchedules()
    } catch (error) {
      console.error("Failed to save schedule:", error)
      toast.error(
        `Failed to ${editingSchedule ? "update" : "create"} schedule`,
      )
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: string, scheduleName: string) => {
    if (
      !confirm(
        `Are you sure you want to delete the schedule "${scheduleName}"?`,
      )
    ) {
      return
    }

    try {
      await deleteSchedule(id)
      toast.success("Schedule deleted successfully")
      fetchSchedules()
    } catch (error) {
      console.error("Failed to delete schedule:", error)
      toast.error("Failed to delete schedule")
    }
  }

  const handleToggle = async (schedule: Schedule) => {
    try {
      await toggleSchedule(schedule.id, !schedule.enabled)
      toast.success(
        `Schedule ${!schedule.enabled ? "enabled" : "disabled"} successfully`,
      )
      fetchSchedules()
    } catch (error) {
      console.error("Failed to toggle schedule:", error)
      toast.error("Failed to toggle schedule")
    }
  }

  const handleRunNow = async (id: string, scheduleName: string) => {
    try {
      setRunningScheduleId(id)
      await runScheduleNow(id)
      toast.success(`Schedule "${scheduleName}" is running`)
      // Refresh to show updated run count
      setTimeout(() => fetchSchedules(), 2000)
    } catch (error) {
      console.error("Failed to run schedule:", error)
      toast.error("Failed to run schedule")
    } finally {
      setRunningScheduleId(null)
    }
  }

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "Never"
    return new Date(timestamp).toLocaleString()
  }

  if (isLoading) {
    return (
      <section
        className="rounded-2xl border bg-white p-6 shadow-sm"
        aria-labelledby="schedules-heading"
      >
        <div className="flex h-40 flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading schedules...</span>
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-4">
      <section
        className="rounded-2xl border bg-white p-6 shadow-sm"
        aria-labelledby="schedules-heading"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              <h3
                id="schedules-heading"
                className="text-xl font-semibold text-foreground"
              >
                Scheduled Tasks
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Automate agent queries to run on a schedule.
            </p>
          </div>
          <Button onClick={handleCreateNew} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Create Schedule
          </Button>
        </div>

        <div>
          {schedules.length === 0
            ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-muted-foreground/50 bg-muted/40 p-8 text-center">
                <Clock className="h-6 w-6 text-muted-foreground" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    No schedules yet
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Create your first scheduled task to automate agent queries
                  </p>
                </div>
              </div>
            )
            : (
              <div className="rounded-lg border [&_[data-slot=table-container]]:overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-32">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedules.map((schedule) => (
                      <TableRow key={schedule.id}>
                        <TableCell className="max-w-md !whitespace-normal">
                          <div className="space-y-1 min-w-0">
                            <div className="font-medium truncate">
                              {schedule.name}
                            </div>
                            <div className="text-xs text-muted-foreground line-clamp-1 break-words">
                              {schedule.prompt}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="font-mono text-xs"
                          >
                            {schedule.cronExpression}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={schedule.enabled}
                            onCheckedChange={() => handleToggle(schedule)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleRunNow(schedule.id, schedule.name)}
                              disabled={runningScheduleId === schedule.id}
                              title="Run now"
                            >
                              {runningScheduleId === schedule.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Play className="h-4 w-4" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(schedule)}
                              title="Edit"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="View stats"
                                >
                                  <Info className="h-4 w-4" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto">
                                <div className="space-y-3">
                                  <h4 className="font-medium text-sm">
                                    Schedule Information
                                  </h4>
                                  <div className="space-y-2">
                                    <div>
                                      <div className="text-xs text-muted-foreground mb-1">
                                        Last Run
                                      </div>
                                      <div className="text-sm">
                                        {formatDate(schedule.lastRunAt)}
                                      </div>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                      <div className="flex items-center gap-2">
                                        <Badge variant="secondary">
                                          {schedule.runCount} runs
                                        </Badge>
                                      </div>
                                      {schedule.failureCount > 0 && (
                                        <div className="flex items-center gap-2">
                                          <Badge variant="destructive">
                                            {schedule.failureCount} fails
                                          </Badge>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleDelete(schedule.id, schedule.name)}
                              title="Delete"
                            >
                              <Trash className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
        </div>
      </section>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSchedule ? "Edit Schedule" : "Create Schedule"}
            </DialogTitle>
            <DialogDescription>
              Configure when and how your agent should run automatically
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="schedule-name">Name</Label>
              <Input
                id="schedule-name"
                value={name}
                onChange={(e) =>
                  setName(
                    (e.target as HTMLInputElement | HTMLTextAreaElement).value,
                  )}
                placeholder="Daily Summary"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule-prompt">Prompt</Label>
              <Textarea
                id="schedule-prompt"
                value={prompt}
                onChange={(e) =>
                  setPrompt(
                    (e.target as HTMLInputElement | HTMLTextAreaElement).value,
                  )}
                placeholder="What question should the agent answer?"
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>Schedule</Label>
              <CronBuilder
                value={cronExpression}
                onChange={setCronExpression}
              />
            </div>

            <BackoffConfig
              enabled={backoffEnabled}
              schedule={backoffSchedule}
              onEnabledChange={setBackoffEnabled}
              onScheduleChange={setBackoffSchedule}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving
                ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                )
                : editingSchedule
                ? "Update"
                : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
