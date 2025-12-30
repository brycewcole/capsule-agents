import { assertEquals, assertMatch } from "@std/assert"
import { expandPromptVariables, listPromptVariables } from "./prompt-variables.ts"

Deno.test("expandPromptVariables - DATETIME variable", () => {
  const result = expandPromptVariables("The current datetime is {{DATETIME}}")

  // Should contain a human-readable date format
  // e.g., "The current datetime is Monday, December 30, 2025 at 3:30 PM"
  assertMatch(result, /The current datetime is \w+, \w+ \d{1,2}, \d{4} at \d{1,2}:\d{2} (AM|PM)/)
})

Deno.test("expandPromptVariables - escape sequences", () => {
  // {{{{ should become {{
  assertEquals(
    expandPromptVariables("Use {{{{VARIABLE}}}} syntax"),
    "Use {{VARIABLE}} syntax",
  )

  // }}}} should become }}
  assertEquals(
    expandPromptVariables("End with }}}}"),
    "End with }}",
  )

  // Combined escapes
  assertEquals(
    expandPromptVariables("{{{{}}}}"),
    "{{}}",
  )
})

Deno.test("expandPromptVariables - unknown variables left unchanged", () => {
  assertEquals(
    expandPromptVariables("Hello {{UNKNOWN}}"),
    "Hello {{UNKNOWN}}",
  )

  assertEquals(
    expandPromptVariables("{{FOO}} and {{BAR}}"),
    "{{FOO}} and {{BAR}}",
  )
})

Deno.test("expandPromptVariables - mixed content", () => {
  const result = expandPromptVariables(
    "Time: {{DATETIME}}, escaped: {{{{, unknown: {{FOO}}",
  )

  // Should contain the datetime, escaped braces, and unknown variable unchanged
  assertMatch(result, /Time: \w+, \w+ \d{1,2}, \d{4} at \d{1,2}:\d{2} (AM|PM), escaped: \{\{, unknown: \{\{FOO\}\}/)
})

Deno.test("expandPromptVariables - empty and null-like inputs", () => {
  assertEquals(expandPromptVariables(""), "")
  assertEquals(expandPromptVariables("   "), "   ")
})

Deno.test("expandPromptVariables - no variables", () => {
  assertEquals(
    expandPromptVariables("No variables here"),
    "No variables here",
  )
})

Deno.test("expandPromptVariables - multiple DATETIME occurrences", () => {
  const result = expandPromptVariables("Start: {{DATETIME}}, End: {{DATETIME}}")

  // Both should be expanded
  const matches = result.match(/\w+, \w+ \d{1,2}, \d{4} at \d{1,2}:\d{2} (AM|PM)/g)
  assertEquals(matches?.length, 2)
})

Deno.test("expandPromptVariables - variable names are case sensitive", () => {
  // Only uppercase DATETIME should be recognized
  assertEquals(
    expandPromptVariables("{{datetime}}"),
    "{{datetime}}",
  )

  assertEquals(
    expandPromptVariables("{{DateTime}}"),
    "{{DateTime}}",
  )
})

Deno.test("listPromptVariables - returns available variables", () => {
  const variables = listPromptVariables()

  assertEquals(variables.includes("DATETIME"), true)
})
