/* Rendering safety.
   The audit flagged the app's innerHTML-everywhere pattern as an XSS surface the
   moment user-generated content (names, captions, comments, song titles) exists.
   ALL such values must pass through esc() before being inserted into HTML.
   Phase 4+ (social) depends on this being used consistently. */

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// Tagged-template helper: html`<b>${userName}</b>` auto-escapes interpolations.
export function html(strings, ...values) {
  return strings.reduce((out, s, i) => out + s + (i < values.length ? esc(values[i]) : ""), "");
}
