const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

/**
 * Pulls every email address out of a CSV / txt file. Works with or without a
 * header row and regardless of which column holds the email.
 */
export function extractEmails(text: string): string[] {
  const found = text.match(EMAIL_RE) ?? []
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of found) {
    const email = raw.toLowerCase()
    if (!seen.has(email)) {
      seen.add(email)
      result.push(email)
    }
  }
  return result
}

export async function readLeadsFile(file: File) {
  const text = await file.text()
  return extractEmails(text)
}
