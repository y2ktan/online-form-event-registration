import { describe, test, expect } from "vitest";
import {
  parseNotifyEmails,
  buildNotificationHtml,
  type NotificationAnswer,
} from "../lib/notifications";

// ─── parseNotifyEmails ──────────────────────────────────────────────

describe("parseNotifyEmails", () => {
  test("returns empty array for null/undefined/empty", () => {
    expect(parseNotifyEmails(null)).toEqual([]);
    expect(parseNotifyEmails(undefined)).toEqual([]);
    expect(parseNotifyEmails("")).toEqual([]);
  });

  test("parses single valid email", () => {
    expect(parseNotifyEmails("a@b.com")).toEqual(["a@b.com"]);
  });

  test("parses multiple comma-separated emails", () => {
    expect(parseNotifyEmails("a@b.com, c@d.com")).toEqual(["a@b.com", "c@d.com"]);
  });

  test("trims whitespace around emails", () => {
    expect(parseNotifyEmails("  a@b.com ,  c@d.com  ")).toEqual(["a@b.com", "c@d.com"]);
  });

  test("filters out invalid emails", () => {
    expect(parseNotifyEmails("a@b.com, not-email, c@d.com, @bad")).toEqual(["a@b.com", "c@d.com"]);
  });

  test("filters out empty segments from trailing commas", () => {
    expect(parseNotifyEmails("a@b.com,,,")).toEqual(["a@b.com"]);
  });

  test("rejects emails without domain", () => {
    expect(parseNotifyEmails("user@")).toEqual([]);
  });

  test("rejects emails without @ symbol", () => {
    expect(parseNotifyEmails("userexample.com")).toEqual([]);
  });
});

// ─── buildNotificationHtml ──────────────────────────────────────────

describe("buildNotificationHtml", () => {
  const answers: NotificationAnswer[] = [
    { label: "Name", value: "Alice", type: "SHORT_TEXT" },
    { label: "Hobbies", value: '["Reading","Gaming"]', type: "CHECKBOX" },
  ];

  test("includes form title", () => {
    const html = buildNotificationHtml("My Form", "ABC123", null, []);
    expect(html).toContain("My Form");
  });

  test("includes short code", () => {
    const html = buildNotificationHtml("Form", "XYZ789", null, []);
    expect(html).toContain("XYZ789");
  });

  test("includes phone number when provided", () => {
    const html = buildNotificationHtml("Form", "A1", "+60123456789", []);
    expect(html).toContain("+60123456789");
    expect(html).toContain("Phone");
  });

  test("omits phone row when null", () => {
    const html = buildNotificationHtml("Form", "A1", null, []);
    expect(html).not.toContain("Phone");
  });

  test("includes answer labels and values", () => {
    const html = buildNotificationHtml("Form", "A1", null, answers);
    expect(html).toContain("Name");
    expect(html).toContain("Alice");
    expect(html).toContain("Hobbies");
    expect(html).toContain("Reading, Gaming");
  });

  test("formats checkbox answers as comma-separated", () => {
    const html = buildNotificationHtml("Form", "A1", null, [
      { label: "Tags", value: '["A","B","C"]', type: "CHECKBOX" },
    ]);
    expect(html).toContain("A, B, C");
  });

  test("formats grid answers as key-value pairs", () => {
    const html = buildNotificationHtml("Form", "A1", null, [
      { label: "Grid", value: '{"Row1":"ColA","Row2":"ColB"}', type: "MULTIPLE_CHOICE_GRID" },
    ]);
    expect(html).toContain("Row1: ColA");
    expect(html).toContain("Row2: ColB");
  });

  test("shows dash for empty value", () => {
    const html = buildNotificationHtml("Form", "A1", null, [
      { label: "Empty", value: "", type: "SHORT_TEXT" },
    ]);
    expect(html).toContain("—");
  });

  test("escapes HTML in values to prevent XSS", () => {
    const html = buildNotificationHtml("Form", "A1", null, [
      { label: "Input", value: '<script>alert("xss")</script>', type: "SHORT_TEXT" },
    ]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("escapes HTML in form title", () => {
    const html = buildNotificationHtml('<img src=x onerror="alert(1)">', "A1", null, []);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  test("includes form URL link when provided", () => {
    const html = buildNotificationHtml("Form", "A1", null, [], "https://example.com/admin/forms/123");
    expect(html).toContain("https://example.com/admin/forms/123");
    expect(html).toContain("View in dashboard");
  });

  test("omits link when formUrl not provided", () => {
    const html = buildNotificationHtml("Form", "A1", null, []);
    expect(html).not.toContain("View in dashboard");
  });
});

// ─── Performance ────────────────────────────────────────────────────

describe("performance", () => {
  test("parseNotifyEmails is O(n) — 10k calls under 50ms", () => {
    const emails = Array.from({ length: 20 }, (_, i) => `user${i}@example.com`).join(",");
    const start = performance.now();
    for (let i = 0; i < 10_000; i++) parseNotifyEmails(emails);
    expect(performance.now() - start).toBeLessThan(50);
  });

  test("buildNotificationHtml handles 50 answers under 10ms", () => {
    const answers: NotificationAnswer[] = Array.from({ length: 50 }, (_, i) => ({
      label: `Question ${i}`,
      value: `Answer ${i}`,
      type: "SHORT_TEXT",
    }));
    const start = performance.now();
    buildNotificationHtml("Form", "ABC", "+60123", answers);
    expect(performance.now() - start).toBeLessThan(10);
  });
});
