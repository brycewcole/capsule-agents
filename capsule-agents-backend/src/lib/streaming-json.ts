// Utilities for parsing partially streamed JSON payloads (e.g., tool inputs)
export function parsePartialObjectFromStream<T extends Record<string, unknown>>(
  rawInput: string,
  fields: Array<keyof T>,
): Partial<T> | undefined {
  const attemptParse = (
    value: unknown,
  ): Partial<T> | undefined => {
    if (typeof value === "string") {
      try {
        return attemptParse(JSON.parse(value))
      } catch {
        return undefined
      }
    }

    if (typeof value === "object" && value !== null) {
      const record = value as Record<string, unknown>
      const parsed: Partial<T> = {}

      for (const field of fields) {
        const val = record[field as string]
        if (typeof val === "string") {
          ;(parsed as Record<string, string>)[field as string] = val
        }
      }

      return Object.keys(parsed).length > 0 ? parsed : undefined
    }

    return undefined
  }

  const trimmed = rawInput.trim()
  if (!trimmed) return undefined

  const parsed = attemptParse(trimmed)
  if (parsed) return parsed

  const start = trimmed.indexOf("{")
  const end = trimmed.lastIndexOf("}")
  if (start !== -1 && end > start) {
    const candidate = trimmed.slice(start, end + 1)
    return attemptParse(candidate)
  }

  return undefined
}

export function extractStringFieldFromBuffer(
  buffer: string,
  field: string,
): string | undefined {
  const keyIndex = buffer.indexOf(`"${field}"`)
  if (keyIndex === -1) return undefined

  const colonIndex = buffer.indexOf(":", keyIndex)
  if (colonIndex === -1) return undefined

  const startQuote = buffer.indexOf('"', colonIndex)
  if (startQuote === -1) return undefined

  let result = ""
  let escaped = false
  for (let i = startQuote + 1; i < buffer.length; i++) {
    const char = buffer[i]
    if (escaped) {
      switch (char) {
        case "n":
          result += "\n"
          break
        case "r":
          result += "\r"
          break
        case "t":
          result += "\t"
          break
        case "\\":
          result += "\\"
          break
        case '"':
          result += '"'
          break
        case "u":
          // Handle unicode escape \uXXXX - skip for now, add placeholder
          // We need 4 more hex digits after \u
          if (i + 4 < buffer.length) {
            const hex = buffer.slice(i + 1, i + 5)
            const codePoint = parseInt(hex, 16)
            if (!isNaN(codePoint)) {
              result += String.fromCharCode(codePoint)
              i += 4 // Skip the 4 hex digits
            } else {
              result += char
            }
          } else {
            // Incomplete unicode escape, return partial
            result += "\\" + char
          }
          break
        default:
          result += char
      }
      escaped = false
      continue
    }

    if (char === "\\") {
      escaped = true
      continue
    }

    if (char === '"') {
      // Found closing quote; return fully decoded string
      return result
    }

    result += char
  }

  // Unterminated string, return partial for streaming
  // Return even empty string to indicate field was found
  return result
}

export function extractStringFieldsFromBuffer<
  T extends Record<string, unknown>,
>(
  buffer: string,
  fields: Array<keyof T>,
): Partial<T> | undefined {
  const parsed: Partial<T> = {}

  for (const field of fields) {
    const value = extractStringFieldFromBuffer(buffer, field as string)
    if (value !== undefined) {
      ;(parsed as Record<string, string>)[field as string] = value
    }
  }

  return Object.keys(parsed).length > 0 ? parsed : undefined
}
