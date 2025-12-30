/**
 * Prompt variable expansion for built-in prompts.
 *
 * Syntax:
 * - {{VARIABLE}} - Expands to the variable's value
 * - {{{{ - Escapes to literal {{
 * - }}}} - Escapes to literal }}
 *
 * Unknown variables are left unchanged.
 */

type PromptVariable = {
  name: string
  resolve: () => string
}

/**
 * Formats the current date/time in a human-readable format.
 * Example: "Monday, December 30, 2025 at 3:30 PM"
 */
function formatDateTime(): string {
  return new Date().toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

const PROMPT_VARIABLES: PromptVariable[] = [
  { name: "DATETIME", resolve: formatDateTime },
]

// Temporary placeholders for escape sequences (using null bytes to avoid collisions)
const OPEN_PLACEHOLDER = "\x00OPEN\x00"
const CLOSE_PLACEHOLDER = "\x00CLOSE\x00"

/**
 * Expands prompt variables in a string.
 *
 * @param text The string to expand variables in
 * @returns The expanded string
 */
export function expandPromptVariables(text: string): string {
  if (!text) {
    return text
  }

  // Step 1: Replace escape sequences with placeholders
  let result = text
    .replace(/\{\{\{\{/g, OPEN_PLACEHOLDER)
    .replace(/\}\}\}\}/g, CLOSE_PLACEHOLDER)

  // Step 2: Replace known variables
  result = result.replace(/\{\{([A-Z_][A-Z0-9_]*)\}\}/g, (_match, varName) => {
    const variable = PROMPT_VARIABLES.find((v) => v.name === varName)
    if (variable) {
      return variable.resolve()
    }
    // Unknown variable - leave unchanged
    return `{{${varName}}}`
  })

  // Step 3: Restore escape sequences
  result = result
    .replace(new RegExp(OPEN_PLACEHOLDER, "g"), "{{")
    .replace(new RegExp(CLOSE_PLACEHOLDER, "g"), "}}")

  return result
}

/**
 * Returns a list of available prompt variable names.
 */
export function listPromptVariables(): string[] {
  return PROMPT_VARIABLES.map((v) => v.name)
}
