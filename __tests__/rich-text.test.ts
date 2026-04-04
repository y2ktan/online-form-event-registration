import { describe, test, expect } from "vitest";
import { sanitizeRichText, stripHtml, isRichTextEmpty } from "../lib/rich-text";
import { sanitize } from "../lib/sanitize";

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

// ─── Multiline description preservation (bug fix) ──────────────────

describe("sanitizeRichText — multiline description preservation", () => {
  test("preserves separate <p> tags for multiline content (Tiptap output)", () => {
    const tiptapHtml = "<p>时间：1700 - 2000</p><p>地点：慈济园区</p>";
    const result = sanitizeRichText(tiptapHtml);
    expect(result).toBe("<p>时间：1700 - 2000</p><p>地点：慈济园区</p>");
  });

  test("preserves <br> inside paragraphs", () => {
    const html = "<p>Line 1<br>Line 2</p>";
    expect(sanitizeRichText(html)).toBe("<p>Line 1<br>Line 2</p>");
  });

  test("preserves multiple paragraphs with formatting", () => {
    const html = "<p><b>501</b> 與上人連線+浴佛集訓（志工）</p><p>时间：1700 - 2000</p><p>地点：慈济园区</p>";
    const result = sanitizeRichText(html);
    expect(result).toContain("<p><b>501</b>");
    expect(result).toContain("<p>时间：1700 - 2000</p>");
    expect(result).toContain("<p>地点：慈济园区</p>");
  });

  test("preserves empty paragraphs (blank lines between content)", () => {
    const html = "<p>Line 1</p><p></p><p>Line 3</p>";
    expect(sanitizeRichText(html)).toBe("<p>Line 1</p><p></p><p>Line 3</p>");
  });

  test("round-trip: sanitizeRichText output survives repeated sanitization", () => {
    const original = "<p>时间：1700 - 2000</p><p>地点：慈济园区</p>";
    const first = sanitizeRichText(original);
    const second = sanitizeRichText(first);
    expect(second).toBe(first);
  });
});

// ─── sanitize vs sanitizeRichText contrast (the bug) ────────────────

describe("sanitize strips multiline structure (old bug behavior)", () => {
  test("sanitize collapses <p> tags into single line", () => {
    const html = "<p>时间：1700 - 2000</p><p>地点：慈济园区</p>";
    const stripped = sanitize(html);
    // sanitize removes ALL tags — text becomes one line
    expect(stripped).not.toContain("<p>");
    expect(stripped).toBe("时间：1700 - 2000地点：慈济园区");
  });

  test("sanitizeRichText preserves the same input", () => {
    const html = "<p>时间：1700 - 2000</p><p>地点：慈济园区</p>";
    const preserved = sanitizeRichText(html);
    expect(preserved).toContain("<p>");
    expect(preserved).toBe(html);
  });
});

// ─── Security: sanitizeRichText still blocks dangerous content ──────

describe("sanitizeRichText — security in description context", () => {
  test("strips script tags from pasted descriptions", () => {
    const html = '<p>时间：1700</p><script>alert("xss")</script><p>地点：慈济园区</p>';
    const result = sanitizeRichText(html);
    expect(result).not.toContain("<script>");
    expect(result).toContain("<p>时间：1700</p>");
    expect(result).toContain("<p>地点：慈济园区</p>");
  });

  test("strips onerror attributes from injected tags", () => {
    const html = '<p>text</p><img onerror="alert(1)" src="x"><p>more</p>';
    const result = sanitizeRichText(html);
    expect(result).not.toContain("<img");
    expect(result).not.toContain("onerror");
    expect(result).toContain("<p>text</p>");
    expect(result).toContain("<p>more</p>");
  });

  test("strips event handlers from allowed tags", () => {
    const html = '<p onclick="alert(1)">click me</p>';
    const result = sanitizeRichText(html);
    expect(result).not.toContain("onclick");
    expect(result).toBe("<p>click me</p>");
  });

  test("strips iframe from descriptions", () => {
    const html = '<p>before</p><iframe src="evil.com"></iframe><p>after</p>';
    const result = sanitizeRichText(html);
    expect(result).not.toContain("<iframe");
    expect(result).toContain("<p>before</p>");
    expect(result).toContain("<p>after</p>");
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

  test("sanitizeRichText handles large multiline descriptions efficiently", () => {
    // Simulate 100 paragraphs (typical large section description)
    const paragraphs = Array.from({ length: 100 }, (_, i) => `<p>Line ${i}: ${"内容".repeat(50)}</p>`).join("");
    const start = performance.now();
    for (let i = 0; i < 1_000; i++) sanitizeRichText(paragraphs);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });

  test("stripHtml handles large input efficiently", () => {
    const html = "<p>" + "a".repeat(10_000) + "</p>";
    const start = performance.now();
    const result = stripHtml(html);
    expect(performance.now() - start).toBeLessThan(10);
    expect(result.length).toBe(10_000);
  });
});
