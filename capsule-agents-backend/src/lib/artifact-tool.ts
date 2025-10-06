import { tool } from "ai"
import { z } from "zod"

export const artifactInputSchema = z.object({
  name: z.string().describe("Artifact name/title"),
  description: z.string().optional().describe(
    "Brief description of the artifact",
  ),
  content: z.string().describe("The artifact content"),
  contentType: z.enum(["html", "markdown", "code", "text"]).describe(
    "Content type",
  ),
})

export type ArtifactInput = z.infer<typeof artifactInputSchema>

export const artifactTool = tool({
  description:
    "Create an artifact for visual content, interactive demos, or formatted documents. Use this for HTML pages, code examples, diagrams, or any content that should be presented separately from the conversation.",
  inputSchema: artifactInputSchema,
  execute: async ({ name, description, content, contentType }) => ({
    success: true,
    name,
    description,
    contentType,
    size: content.length,
  }),
})
