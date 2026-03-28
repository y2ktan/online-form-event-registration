/**
 * Rich text sanitization helpers — O(n) processing.
 *
 * Only allows: <b>, <i>, <u>, <a>, <ol>, <ul>, <li>, <p>, <br>
 * Strips everything else (headings, tables, scripts, etc.).
 */

const ALLOWED_TAGS = new Set([
  "b", "strong", "i", "em", "u", "a",
  "ol", "ul", "li", "p", "br",
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "target", "rel"]),
};

/**
 * Sanitize an HTML string to only contain the 7 supported formatting styles.
 * O(n) — single pass with a simple state machine.
 */
export function sanitizeRichText(html: string): string {
  if (!html) return "";
  // Use a regex-based approach for O(n) tag filtering
  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, tag, attrs) => {
    const lower = tag.toLowerCase();
    const isClosing = match.startsWith("</");

    if (!ALLOWED_TAGS.has(lower)) return "";

    if (isClosing) return `</${lower}>`;

    // For allowed tags, filter attributes
    const allowedAttrs = ALLOWED_ATTRS[lower];
    if (!allowedAttrs) return `<${lower}>`;

    // Parse and filter attributes
    const filtered = filterAttributes(attrs, allowedAttrs);
    // Force links to open in new tab safely
    if (lower === "a") {
      const hasTarget = /target\s*=/i.test(filtered);
      const extra = hasTarget ? "" : ' target="_blank" rel="noopener noreferrer"';
      return `<${lower}${filtered}${extra}>`;
    }
    return `<${lower}${filtered}>`;
  });
}

function filterAttributes(attrString: string, allowed: Set<string>): string {
  if (!attrString.trim()) return "";
  const result: string[] = [];
  const re = /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let m;
  while ((m = re.exec(attrString)) !== null) {
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? "";
    if (allowed.has(name)) {
      // Prevent javascript: URLs
      if (name === "href" && /^\s*javascript:/i.test(value)) continue;
      result.push(`${name}="${value}"`);
    }
  }
  return result.length > 0 ? " " + result.join(" ") : "";
}

/**
 * Strip all HTML tags, returning plain text. O(n).
 */
export function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/**
 * Check if an HTML string has any meaningful content (not just empty tags).
 */
export function isRichTextEmpty(html: string): boolean {
  if (!html) return true;
  const text = stripHtml(html).trim();
  return text.length === 0;
}
