/**
 * JSON for a `<script type="application/ld+json">` tag. Product names and descriptions are owner-typed text, so the
 * output must never contain a literal `<` (it could close the tag or open `<!--`) or the JS line separators
 * U+2028 / U+2029. JSON.parse reads the escaped form back to the original value.
 */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
