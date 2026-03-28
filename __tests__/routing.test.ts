import { describe, test, expect } from "vitest";
import {
  evaluateQuestionRouting,
  resolveNextSection,
  validateFormRouting,
  validateRegexPattern,
  testRegexPattern,
  OptionMatchRouting,
  CheckboxRouting,
  RegexRouting,
  DateRouting,
  TimeRouting,
} from "../lib/routing";

// ─── evaluateQuestionRouting ────────────────────────────────────────

describe("evaluateQuestionRouting", () => {
  test("returns null when routing is null/undefined/disabled", () => {
    expect(evaluateQuestionRouting(null, "a", "SHORT_TEXT")).toBeNull();
    expect(evaluateQuestionRouting(undefined, "a", "SHORT_TEXT")).toBeNull();
    expect(
      evaluateQuestionRouting(
        { enabled: false, type: "OPTION_MATCH", rules: { a: "s1" } },
        "a",
        "MULTIPLE_CHOICE"
      )
    ).toBeNull();
  });

  // ── OPTION_MATCH ──

  describe("OPTION_MATCH", () => {
    const routing: OptionMatchRouting = {
      enabled: true,
      type: "OPTION_MATCH",
      rules: { Yes: "section-2", No: "SUBMIT" },
    };

    test("matches exact option value", () => {
      expect(evaluateQuestionRouting(routing, "Yes", "MULTIPLE_CHOICE")).toBe("section-2");
      expect(evaluateQuestionRouting(routing, "No", "MULTIPLE_CHOICE")).toBe("SUBMIT");
    });

    test("trims whitespace before matching", () => {
      expect(evaluateQuestionRouting(routing, "  Yes  ", "MULTIPLE_CHOICE")).toBe("section-2");
    });

    test("returns null for unmatched value", () => {
      expect(evaluateQuestionRouting(routing, "Maybe", "MULTIPLE_CHOICE")).toBeNull();
    });

    test("returns null for empty answer", () => {
      expect(evaluateQuestionRouting(routing, "", "MULTIPLE_CHOICE")).toBeNull();
    });
  });

  // ── CHECKBOX ──

  describe("CHECKBOX", () => {
    const routing: CheckboxRouting = {
      enabled: true,
      type: "CHECKBOX",
      rules: [
        { operator: "ANY_OF", options: ["A", "B"], destination: "s-any" },
        { operator: "ALL_OF", options: ["X", "Y"], destination: "s-all" },
        { operator: "NONE_OF", options: ["Z"], destination: "s-none" },
      ],
    };

    test("ANY_OF matches when at least one selected option is in the rule", () => {
      expect(evaluateQuestionRouting(routing, JSON.stringify(["A"]), "CHECKBOX")).toBe("s-any");
      expect(evaluateQuestionRouting(routing, JSON.stringify(["B", "C"]), "CHECKBOX")).toBe("s-any");
    });

    test("ALL_OF matches only when all options are selected", () => {
      const allOf: CheckboxRouting = {
        enabled: true,
        type: "CHECKBOX",
        rules: [{ operator: "ALL_OF", options: ["X", "Y"], destination: "s-all" }],
      };
      expect(evaluateQuestionRouting(allOf, JSON.stringify(["X", "Y"]), "CHECKBOX")).toBe("s-all");
      expect(evaluateQuestionRouting(allOf, JSON.stringify(["X"]), "CHECKBOX")).toBeNull();
      expect(evaluateQuestionRouting(allOf, JSON.stringify(["X", "Y", "Z"]), "CHECKBOX")).toBe("s-all");
    });

    test("NONE_OF matches when none of the options are selected", () => {
      const noneOf: CheckboxRouting = {
        enabled: true,
        type: "CHECKBOX",
        rules: [{ operator: "NONE_OF", options: ["Z"], destination: "s-none" }],
      };
      expect(evaluateQuestionRouting(noneOf, JSON.stringify(["A"]), "CHECKBOX")).toBe("s-none");
      expect(evaluateQuestionRouting(noneOf, JSON.stringify(["Z"]), "CHECKBOX")).toBeNull();
    });

    test("returns null for invalid JSON", () => {
      expect(evaluateQuestionRouting(routing, "not-json", "CHECKBOX")).toBeNull();
    });

    test("returns null for empty selection", () => {
      expect(evaluateQuestionRouting(routing, "", "CHECKBOX")).toBeNull();
      expect(evaluateQuestionRouting(routing, "[]", "CHECKBOX")).toBeNull();
    });

    test("first matching rule wins (short-circuit)", () => {
      // ["A"] matches ANY_OF first, so s-any is returned even though NONE_OF["Z"] also matches
      expect(evaluateQuestionRouting(routing, JSON.stringify(["A"]), "CHECKBOX")).toBe("s-any");
    });
  });

  // ── REGEX ──

  describe("REGEX", () => {
    const routing: RegexRouting = {
      enabled: true,
      type: "REGEX",
      rules: [
        { pattern: "^\\d+$", destination: "s-number" },
        { pattern: "hello", flags: "i", destination: "s-hello" },
      ],
    };

    test("matches digits-only pattern", () => {
      expect(evaluateQuestionRouting(routing, "12345", "SHORT_TEXT")).toBe("s-number");
    });

    test("matches case-insensitive pattern", () => {
      expect(evaluateQuestionRouting(routing, "Hello World", "SHORT_TEXT")).toBe("s-hello");
    });

    test("returns null for no match", () => {
      expect(evaluateQuestionRouting(routing, "abc", "SHORT_TEXT")).toBeNull();
    });

    test("returns null for empty answer", () => {
      expect(evaluateQuestionRouting(routing, "", "SHORT_TEXT")).toBeNull();
      expect(evaluateQuestionRouting(routing, "   ", "SHORT_TEXT")).toBeNull();
    });

    test("PARAGRAPH auto-adds multiline flag", () => {
      const r: RegexRouting = {
        enabled: true,
        type: "REGEX",
        rules: [{ pattern: "^start", flags: "i", destination: "s1" }],
      };
      // multiline: ^ matches start of each line
      expect(evaluateQuestionRouting(r, "line1\nstart of line2", "PARAGRAPH")).toBe("s1");
    });

    test("skips invalid regex patterns gracefully", () => {
      const r: RegexRouting = {
        enabled: true,
        type: "REGEX",
        rules: [
          { pattern: "[invalid", destination: "s-bad" },
          { pattern: "ok", destination: "s-ok" },
        ],
      };
      expect(evaluateQuestionRouting(r, "ok", "SHORT_TEXT")).toBe("s-ok");
    });
  });

  // ── DATE ──

  describe("DATE", () => {
    const routing: DateRouting = {
      enabled: true,
      type: "DATE",
      rules: [
        { operator: "BEFORE", value: "2025-06-01", destination: "s-before" },
        { operator: "AFTER", value: "2025-12-31", destination: "s-after" },
        { operator: "ON", value: "2025-07-04", destination: "s-on" },
        { operator: "BETWEEN", value: "2025-09-01", endValue: "2025-09-30", destination: "s-between" },
      ],
    };

    test("BEFORE matches", () => {
      expect(evaluateQuestionRouting(routing, "2025-05-01", "DATE")).toBe("s-before");
    });

    test("AFTER matches", () => {
      expect(evaluateQuestionRouting(routing, "2026-01-15", "DATE")).toBe("s-after");
    });

    test("ON matches exact date", () => {
      expect(evaluateQuestionRouting(routing, "2025-07-04", "DATE")).toBe("s-on");
    });

    test("BETWEEN matches inclusive range", () => {
      expect(evaluateQuestionRouting(routing, "2025-09-15", "DATE")).toBe("s-between");
      expect(evaluateQuestionRouting(routing, "2025-09-01", "DATE")).toBe("s-between");
      expect(evaluateQuestionRouting(routing, "2025-09-30", "DATE")).toBe("s-between");
    });

    test("returns null for empty/invalid date", () => {
      expect(evaluateQuestionRouting(routing, "", "DATE")).toBeNull();
      expect(evaluateQuestionRouting(routing, "not-a-date", "DATE")).toBeNull();
    });

    test("returns null when no rule matches", () => {
      expect(evaluateQuestionRouting(routing, "2025-08-15", "DATE")).toBeNull();
    });
  });

  // ── TIME ──

  describe("TIME", () => {
    const routing: TimeRouting = {
      enabled: true,
      type: "TIME",
      rules: [
        { operator: "BEFORE", value: "09:00", destination: "s-morning" },
        { operator: "AFTER", value: "17:00", destination: "s-evening" },
        { operator: "BETWEEN", value: "12:00", endValue: "13:00", destination: "s-lunch" },
      ],
    };

    test("BEFORE matches", () => {
      expect(evaluateQuestionRouting(routing, "08:30", "TIME")).toBe("s-morning");
    });

    test("AFTER matches", () => {
      expect(evaluateQuestionRouting(routing, "18:00", "TIME")).toBe("s-evening");
    });

    test("BETWEEN matches inclusive range", () => {
      expect(evaluateQuestionRouting(routing, "12:00", "TIME")).toBe("s-lunch");
      expect(evaluateQuestionRouting(routing, "12:30", "TIME")).toBe("s-lunch");
      expect(evaluateQuestionRouting(routing, "13:00", "TIME")).toBe("s-lunch");
    });

    test("returns null for empty/invalid time", () => {
      expect(evaluateQuestionRouting(routing, "", "TIME")).toBeNull();
      expect(evaluateQuestionRouting(routing, "abc", "TIME")).toBeNull();
    });

    test("returns null when no rule matches", () => {
      expect(evaluateQuestionRouting(routing, "10:30", "TIME")).toBeNull();
    });
  });
});

// ─── resolveNextSection ─────────────────────────────────────────────

describe("resolveNextSection", () => {
  const sections = [
    { id: "s0", order: 0, routingConfig: "{}" },
    { id: "s1", order: 1, routingConfig: "{}" },
    { id: "s2", order: 2, routingConfig: "{}" },
  ];

  test("linear fallback: goes to next section", () => {
    const result = resolveNextSection(sections, 0, [], {});
    expect(result).toEqual({ type: "NEXT", sectionIndex: 1 });
  });

  test("linear fallback: last section triggers SUBMIT", () => {
    const result = resolveNextSection(sections, 2, [], {});
    expect(result).toEqual({ type: "SUBMIT" });
  });

  test("question-level routing overrides section default", () => {
    const questions = [
      {
        id: "q1",
        type: "MULTIPLE_CHOICE",
        config: JSON.stringify({
          routing: { enabled: true, type: "OPTION_MATCH", rules: { Yes: "s2" } },
        }),
      },
    ];
    const answers = { q1: "Yes" };
    const result = resolveNextSection(sections, 0, questions, answers);
    expect(result).toEqual({ type: "SECTION", sectionId: "s2", sectionIndex: 2 });
  });

  test("question routing SUBMIT destination", () => {
    const questions = [
      {
        id: "q1",
        type: "MULTIPLE_CHOICE",
        config: JSON.stringify({
          routing: { enabled: true, type: "OPTION_MATCH", rules: { No: "SUBMIT" } },
        }),
      },
    ];
    const result = resolveNextSection(sections, 0, questions, { q1: "No" });
    expect(result).toEqual({ type: "SUBMIT" });
  });

  test("question routing NEXT destination", () => {
    const questions = [
      {
        id: "q1",
        type: "MULTIPLE_CHOICE",
        config: JSON.stringify({
          routing: { enabled: true, type: "OPTION_MATCH", rules: { Ok: "NEXT" } },
        }),
      },
    ];
    const result = resolveNextSection(sections, 1, questions, { q1: "Ok" });
    expect(result).toEqual({ type: "NEXT", sectionIndex: 2 });
  });

  test("section-level default routing to specific section", () => {
    const sectionsWithRouting = [
      { id: "s0", order: 0, routingConfig: JSON.stringify({ defaultRoute: "s2" }) },
      { id: "s1", order: 1, routingConfig: "{}" },
      { id: "s2", order: 2, routingConfig: "{}" },
    ];
    const result = resolveNextSection(sectionsWithRouting, 0, [], {});
    expect(result).toEqual({ type: "SECTION", sectionId: "s2", sectionIndex: 2 });
  });

  test("section-level SUBMIT routing", () => {
    const sectionsWithRouting = [
      { id: "s0", order: 0, routingConfig: JSON.stringify({ defaultRoute: "SUBMIT" }) },
      { id: "s1", order: 1, routingConfig: "{}" },
    ];
    const result = resolveNextSection(sectionsWithRouting, 0, [], {});
    expect(result).toEqual({ type: "SUBMIT" });
  });

  test("section-level NEXT routing at last section triggers SUBMIT", () => {
    const sectionsWithRouting = [
      { id: "s0", order: 0, routingConfig: JSON.stringify({ defaultRoute: "NEXT" }) },
    ];
    const result = resolveNextSection(sectionsWithRouting, 0, [], {});
    expect(result).toEqual({ type: "SUBMIT" });
  });

  test("falls through to section default when question routing doesn't match", () => {
    const sectionsWithRouting = [
      { id: "s0", order: 0, routingConfig: JSON.stringify({ defaultRoute: "s2" }) },
      { id: "s1", order: 1, routingConfig: "{}" },
      { id: "s2", order: 2, routingConfig: "{}" },
    ];
    const questions = [
      {
        id: "q1",
        type: "MULTIPLE_CHOICE",
        config: JSON.stringify({
          routing: { enabled: true, type: "OPTION_MATCH", rules: { Yes: "s1" } },
        }),
      },
    ];
    // answer doesn't match any question routing rule
    const result = resolveNextSection(sectionsWithRouting, 0, questions, { q1: "No" });
    expect(result).toEqual({ type: "SECTION", sectionId: "s2", sectionIndex: 2 });
  });

  test("handles routingConfig as object (not string)", () => {
    const sectionsObj = [
      { id: "s0", order: 0, routingConfig: { defaultRoute: "SUBMIT" } },
      { id: "s1", order: 1, routingConfig: {} },
    ];
    const result = resolveNextSection(sectionsObj, 0, [], {});
    expect(result).toEqual({ type: "SUBMIT" });
  });

  test("invalid target sectionId in question routing falls through", () => {
    const questions = [
      {
        id: "q1",
        type: "MULTIPLE_CHOICE",
        config: JSON.stringify({
          routing: { enabled: true, type: "OPTION_MATCH", rules: { Yes: "nonexistent" } },
        }),
      },
    ];
    const result = resolveNextSection(sections, 0, questions, { q1: "Yes" });
    // Should fall through to linear next since target not found
    expect(result).toEqual({ type: "NEXT", sectionIndex: 1 });
  });
});

// ─── validateFormRouting ────────────────────────────────────────────

describe("validateFormRouting", () => {
  const sections = [
    { id: "s0", title: "Section 1", routingConfig: "{}" },
    { id: "s1", title: "Section 2", routingConfig: "{}" },
  ];

  test("returns empty for valid routing", () => {
    const questions = [
      {
        id: "q1",
        label: "Q1",
        type: "MULTIPLE_CHOICE",
        config: JSON.stringify({
          routing: { enabled: true, type: "OPTION_MATCH", rules: { Yes: "s1", No: "SUBMIT" } },
        }),
      },
    ];
    expect(validateFormRouting(sections, questions)).toEqual([]);
  });

  test("detects non-existent section in option routing", () => {
    const questions = [
      {
        id: "q1",
        label: "Favorite",
        type: "MULTIPLE_CHOICE",
        config: JSON.stringify({
          routing: { enabled: true, type: "OPTION_MATCH", rules: { Yes: "bad-id" } },
        }),
      },
    ];
    const errors = validateFormRouting(sections, questions);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("non-existent section");
  });

  test("detects non-existent section in section-level routing", () => {
    const badSections = [
      { id: "s0", title: "S1", routingConfig: JSON.stringify({ defaultRoute: "missing" }) },
    ];
    const errors = validateFormRouting(badSections, []);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("non-existent section");
  });

  test("detects invalid regex pattern", () => {
    const questions = [
      {
        id: "q1",
        label: "Text Q",
        type: "SHORT_TEXT",
        config: JSON.stringify({
          routing: { enabled: true, type: "REGEX", rules: [{ pattern: "[bad", destination: "s1" }] },
        }),
      },
    ];
    const errors = validateFormRouting(sections, questions);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some((e) => e.includes("regex rule 1"))).toBe(true);
  });

  test("detects date BETWEEN with end before start", () => {
    const questions = [
      {
        id: "q1",
        label: "Date Q",
        type: "DATE",
        config: JSON.stringify({
          routing: {
            enabled: true,
            type: "DATE",
            rules: [{ operator: "BETWEEN", value: "2025-12-01", endValue: "2025-01-01", destination: "s1" }],
          },
        }),
      },
    ];
    const errors = validateFormRouting(sections, questions);
    expect(errors.some((e) => e.includes("End date is before start date"))).toBe(true);
  });

  test("detects time BETWEEN with end before start", () => {
    const questions = [
      {
        id: "q1",
        label: "Time Q",
        type: "TIME",
        config: JSON.stringify({
          routing: {
            enabled: true,
            type: "TIME",
            rules: [{ operator: "BETWEEN", value: "17:00", endValue: "09:00", destination: "s1" }],
          },
        }),
      },
    ];
    const errors = validateFormRouting(sections, questions);
    expect(errors.some((e) => e.includes("End time is before start time"))).toBe(true);
  });

  test("skips disabled routing", () => {
    const questions = [
      {
        id: "q1",
        label: "Q1",
        type: "MULTIPLE_CHOICE",
        config: JSON.stringify({
          routing: { enabled: false, type: "OPTION_MATCH", rules: { Yes: "bad-id" } },
        }),
      },
    ];
    expect(validateFormRouting(sections, questions)).toEqual([]);
  });
});

// ─── validateRegexPattern ───────────────────────────────────────────

describe("validateRegexPattern", () => {
  test("returns null for valid pattern", () => {
    expect(validateRegexPattern("^\\d+$")).toBeNull();
    expect(validateRegexPattern("hello", "gi")).toBeNull();
  });

  test("returns error string for invalid pattern", () => {
    const result = validateRegexPattern("[bad");
    expect(typeof result).toBe("string");
    expect(result!.length).toBeGreaterThan(0);
  });
});

// ─── testRegexPattern ───────────────────────────────────────────────

describe("testRegexPattern", () => {
  test("returns true for matching input", () => {
    expect(testRegexPattern("^\\d+$", "", "123")).toBe(true);
  });

  test("returns false for non-matching input", () => {
    expect(testRegexPattern("^\\d+$", "", "abc")).toBe(false);
  });

  test("returns false for invalid pattern", () => {
    expect(testRegexPattern("[bad", "", "test")).toBe(false);
  });
});
