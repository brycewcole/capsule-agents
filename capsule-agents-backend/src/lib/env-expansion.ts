/**
 * Expands environment variables in a string.
 * Supports two syntaxes:
 * - ${VAR} - Expands to the value of VAR, throws if not set
 * - ${VAR:-default} - Expands to VAR if set, otherwise uses default
 *
 * @param value The string value to expand
 * @returns The expanded string
 * @throws Error if a required environment variable is not set
 */
export function expandEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_match, content) => {
    // Check if it has a default value syntax: VAR:-default
    const defaultMatch = content.match(/^([^:]+):-(.*)$/)

    if (defaultMatch) {
      const [, varName, defaultValue] = defaultMatch
      const envValue = Deno.env.get(varName.trim())
      return envValue !== undefined ? envValue : defaultValue
    }

    // No default value, variable is required
    const varName = content.trim()
    const envValue = Deno.env.get(varName)

    if (envValue === undefined) {
      throw new Error(
        `Environment variable ${varName} is required but not set`,
      )
    }

    return envValue
  })
}

/**
 * Recursively expands environment variables in an object.
 * Processes all string values in the object and its nested objects/arrays.
 *
 * @param obj The object to process
 * @returns A new object with all environment variables expanded
 */
export function expandEnvVarsInObject<T>(obj: T): T {
  if (typeof obj === "string") {
    return expandEnvVars(obj) as T
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => expandEnvVarsInObject(item)) as T
  }

  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = expandEnvVarsInObject(value)
    }
    return result as T
  }

  return obj
}
