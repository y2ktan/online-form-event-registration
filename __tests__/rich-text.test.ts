import { describe, test, expect } from "vitest";
import { sanitizeRichText, stripHtml, isRichTextEmpty } from "../lib/rich-text";

// ─── sanitizeRichText ───────────────────────────────────────────────

describe("sanitizeRichText", () => {
  test("returns empty string for null/undefined/empty", () => {
    expect(sanitizeRichText("")).toBe("");
    expect(sanitizeRichText(null as any)).toBe("");
    expect(sanitizeRichText(undefined as any)).toBe("");
  });

  test("preserves allowed inline tags: b, strong, i, em, u", () => {
    const html = "<b>bold</b> <strong>strong</strong> <i>italic</i> <em>em</em> <u>underline</u>";
    expect(sanitizeRichText(html)).toBe(html);
  });

  test("preserves list tags: ol, ul, li", () => {
    const html = "<ul><li>one</li><li>two</li></ul><ol><li>a</li></ol>";
    expect(sanitizeRichText(html)).toBe(html);
  });

  test("preserves p and br tags", () => {
    const html = "<p>paragraph</p><br>";
    expect(sanitizeRichText(html)).toBe("<p>paragraph</p><br>");
  });

  test("preserves anchor tags with href", () => {
    const html = '<a href="https://example.com">link</a>';
    const result = sanitizeRichText(html);
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain("target=");
    expect(result).toContain("link</a>");
  });

  test("strips script tags completely", () => {
    const html = '<p>hello</p><script>alert("xss")</script><p>world</p>';
    const result = sanitizeRichText(html);
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("</script>");
    expect(result).toContain("<p>hello</p>");
    expect(result).toContain("<p>world</p>");
  });

  test("strips heading tags", () => {
    const html = "<h1>Title</h1><h2>Subtitle</h2><p>text</p>";
    const result = sanitizeRichText(html);
    expect(result).not.toContain("<h1>");
    expect(result).not.toContain("<h2>");
    expect(result).toContain("Title");
    expect(result).toContain("<p>text</p>");
  });

  test("strips table tags", () => {
    const html = "<table><tr><td>cell</td></tr></table>";
    const result = sanitizeRichText(html);
    expect(result).not.toContain("<table>");
    expect(result).not.toContain("<tr>");
    expect(result).not.toContain("<td>");
    expect(result).toContain("cell");
  });

  test("strips div, span, img tags", () => {
    const html = '<div><span style="color:red">text</span><img src="x.jpg"></div>';
    const result = sanitizeRichText(html);
    expect(result).not.toContain("<div>");
    expect(result).not.toContain("<span");
    expect(result).not.toContain("<img");
    expect(result).toContain("text");
  });

  test("strips style and class attributes from allowed tags", () => {
    const html = '<b style="color:red" class="foo">bold</b>';
    const result = sanitizeRichText(html);
    expect(result).toBe("<b>bold</b>");
  });

  test("blocks javascript: URLs in links", () => {
    const html = '<a href="javascript:alert(1)">click</a>';
    const result = sanitizeRichText(html);
    expect(result).not.toContain("javascript:");
  });

  test("adds target=_blank to links without it", () => {
    const html = '<a href="https://example.com">link</a>';
    const result = sanitizeRichText(html);
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  test("preserves plain text without tags", () => {
    expect(sanitizeRichText("hello world")).toBe("hello world");
  });

  test("handles complex paste from external source", () => {
    const pasted = `
      <h1>Title</h1>
      <p><b>Bold</b> and <i>italic</i> text</p>
      <table><tr><td>data</td></tr></table>
      <div class="wrapper"><span style="font-size:24px">big</span></div>
      <ul><li>item</li></ul>
      <script>alert('xss')</script>
    `;
    const result = sanitizeRichText(pasted);
    // Allowed tags preserved
    expect(result).toContain("<b>Bold</b>");
    expect(result).toContain("<i>italic</i>");
    expect(result).toContain("<ul><li>item</li></ul>");
    expect(result).toContain("<p>");
    // Disallowed tags stripped
    expect(result).not.toContain("<h1>");
    expect(result).not.toContain("<table>");
    expect(result).not.toContain("<div");
    expect(result).not.toContain("<span");
    expect(result).not.toContain("<script>");
  });

  test("clear formatting removes b, i, u tags but keeps text", () => {
    const html = "<b>bold</b> <i>italic</i> <u>underline</u> plain";
    const text = stripHtml(html);
    expect(text).toBe("bold italic underline plain");
  });
});

// ─── stripHtml ──────────────────────────────────────────────────────

describe("stripHtml", () => {
  test("returns empty string for empty input", () => {
    expect(stripHtml("")).toBe("");
    expect(stripHtml(null as any)).toBe("");
  });

  test("strips all HTML tags", () => {
    expect(stripHtml("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });

  test("decodes common HTML entities", () => {
    expect(stripHtml("&amp; &lt; &gt; &quot; &#39;")).toBe("& < > \" '");
  });

  test("handles nested tags", () => {
    expect(stripHtml("<ul><li><b>item</b></li></ul>")).toBe("item");
  });
});

// ─── isRichTextEmpty ────────────────────────────────────────────────

describe("isRichTextEmpty", () => {
  test("returns true for empty/null/undefined", () => {
    expect(isRichTextEmpty("")).toBe(true);
    expect(isRichTextEmpty(null as any)).toBe(true);
    expect(isRichTextEmpty(undefined as any)).toBe(true);
  });

  test("returns true for empty tags only", () => {
    expect(isRichTextEmpty("<p></p>")).toBe(true);
    expect(isRichTextEmpty("<p><br></p>")).toBe(true);
    expect(isRichTextEmpty("<p> </p>")).toBe(true);
  });

  test("returns false for tags with text content", () => {
    expect(isRichTextEmpty("<p>hello</p>")).toBe(false);
    expect(isRichTextEmpty("<b>x</b>")).toBe(false);
  });
});

// ─── Performance ────────────────────────────────────────────────────

describe("performance", () => {
  test("sanitizeRichText is O(n) — 10k calls under 100ms", () => {
    const html = '<p><b>Bold</b> <i>italic</i> <a href="https://x.com">link</a></p><ul><li>item</li></ul>';
    const start = performance.now();
    for (let i = 0; i < 10_000; i++) sanitizeRichText(html);
    expect(performance.now() - start).toBeLessThan(100);
  });

  test("stripHtml handles large input efficiently", () => {
    const html = "<p>" + "a".repeat(10_000) + "</p>";
    const start = performance.now();
    const result = stripHtml(html);
    expect(performance.now() - start).toBeLessThan(10);
    expect(result.length).toBe(10_000);
  });
});
