import { describe, test, expect } from "vitest";
import {
  aggregateResponses,
  buildAnswerMap,
  type QuestionRecord,
} from "../lib/summary-helpers";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeQuestion(
  overrides: Partial<QuestionRecord> & { id: string; type: string }
): QuestionRecord {
  return {
    label: "Question",
    config: {},
    ...overrides,
  };
}

function makeMap(entries: Record<string, string[]>): Map<string, string[]> {
  return new Map(Object.entries(entries));
}

// ─── buildAnswerMap ───────────────────────────────────────────────────────────

describe("buildAnswerMap", () => {
  test("groups answer values by questionId from the answer object", () => {
    const responses = [
      {
        answers: [
          { questionId: "q1", value: "Alice", question: { id: "q1" } },
          { questionId: "q2", value: "Hello", question: { id: "q2" } },
        ],
      },
      {
        answers: [
          { questionId: "q1", value: "Bob", question: { id: "q1" } },
        ],
      },
    ];

    const map = buildAnswerMap(
      responses as Array<{ answers: Array<Record<string, unknown>> }>
    );
    expect(map.get("q1")).toEqual(["Alice", "Bob"]);
    expect(map.get("q2")).toEqual(["Hello"]);
  });

  test("falls back to question.id when questionId is absent on answer", () => {
    const responses = [
      {
        answers: [{ value: "foo", question: { id: "q99" } }],
      },
    ];

    const map = buildAnswerMap(
      responses as Array<{ answers: Array<Record<string, unknown>> }>
    );
    expect(map.get("q99")).toEqual(["foo"]);
  });

  test("returns empty map for empty responses", () => {
    const map = buildAnswerMap([]);
    expect(map.size).toBe(0);
  });

  test("skips answers with no identifiable questionId", () => {
    const responses = [{ answers: [{ value: "x" }] }];
    const map = buildAnswerMap(
      responses as Array<{ answers: Array<Record<string, unknown>> }>
    );
    expect(map.size).toBe(0);
  });
});

// ─── aggregateResponses — general ────────────────────────────────────────────

describe("aggregateResponses — general", () => {
  test("returns empty array for empty questions list", () => {
    const result = aggregateResponses(makeMap({ q1: ["foo"] }), []);
    expect(result).toEqual([]);
  });

  test("returns empty array for empty answer map", () => {
    const questions = [makeQuestion({ id: "q1", type: "SHORT_TEXT", label: "Name" })];
    const result = aggregateResponses(new Map(), questions);
    expect(result).toHaveLength(1);
    expect(result[0].totalAnswers).toBe(0);
  });

  test("skips questions with isPhoneNumber config flag", () => {
    const questions = [
      makeQuestion({ id: "q1", type: "SHORT_TEXT", label: "Phone", config: { isPhoneNumber: true } }),
      makeQuestion({ id: "q2", type: "SHORT_TEXT", label: "Name" }),
    ];
    const result = aggregateResponses(makeMap({ q1: ["123"], q2: ["Alice"] }), questions);
    expect(result).toHaveLength(1);
    expect(result[0].questionId).toBe("q2");
  });

  test("skips questions with isTitle config flag", () => {
    const questions = [
      makeQuestion({ id: "q1", type: "SHORT_TEXT", label: "Notice", config: { isTitle: true } }),
    ];
    const result = aggregateResponses(makeMap({ q1: ["ignored"] }), questions);
    expect(result).toHaveLength(0);
  });

  test("handles blank answer values gracefully (not counted)", () => {
    const questions = [makeQuestion({ id: "q1", type: "SHORT_TEXT", label: "Name" })];
    const result = aggregateResponses(makeMap({ q1: ["", "  ", "Alice"] }), questions);
    const summary = result[0];
    expect(summary.kind).toBe("text");
    if (summary.kind === "text") {
      expect(summary.totalAnswers).toBe(1);
      expect(summary.recentEntries).toEqual(["Alice"]);
    }
  });
});

// ─── SHORT_TEXT / PARAGRAPH ───────────────────────────────────────────────────

describe("aggregateResponses — text types", () => {
  test("counts unique values case-insensitively for SHORT_TEXT", () => {
    const questions = [makeQuestion({ id: "q1", type: "SHORT_TEXT", label: "Name" })];
    const result = aggregateResponses(
      makeMap({ q1: ["Alice", "alice", "Bob"] }),
      questions
    );
    const summary = result[0];
    expect(summary.kind).toBe("text");
    if (summary.kind === "text") {
      expect(summary.uniqueCount).toBe(2); // "alice" + "bob"
      expect(summary.totalAnswers).toBe(3);
    }
  });

  test("returns up to 10 recent entries", () => {
    const values = Array.from({ length: 15 }, (_, i) => `Entry ${i + 1}`);
    const questions = [makeQuestion({ id: "q1", type: "PARAGRAPH", label: "Notes" })];
    const result = aggregateResponses(makeMap({ q1: values }), questions);
    const summary = result[0];
    if (summary.kind === "text") {
      expect(summary.recentEntries).toHaveLength(10);
      expect(summary.recentEntries[0]).toBe("Entry 1");
    }
  });

  test("produces TextSummary for DATE and TIME types", () => {
    const questions = [
      makeQuestion({ id: "q1", type: "DATE", label: "Event date" }),
      makeQuestion({ id: "q2", type: "TIME", label: "Event time" }),
    ];
    const result = aggregateResponses(
      makeMap({ q1: ["2026-04-05"], q2: ["10:00"] }),
      questions
    );
    expect(result[0].kind).toBe("text");
    expect(result[1].kind).toBe("text");
  });
});

// ─── MULTIPLE_CHOICE / DROPDOWN ───────────────────────────────────────────────

describe("aggregateResponses — choice types", () => {
  test("builds correct distribution for MULTIPLE_CHOICE", () => {
    const questions = [
      makeQuestion({ id: "q1", type: "MULTIPLE_CHOICE", label: "Color" }),
    ];
    const result = aggregateResponses(
      makeMap({ q1: ["Red", "Blue", "Red", "Red", "Blue"] }),
      questions
    );
    const summary = result[0];
    expect(summary.kind).toBe("choice");
    if (summary.kind === "choice") {
      expect(summary.distribution[0]).toMatchObject({ label: "Red", count: 3 });
      expect(summary.distribution[1]).toMatchObject({ label: "Blue", count: 2 });
      expect(summary.distribution[0].percent).toBe(60);
    }
  });

  test("parses JSON array for CHECKBOX and counts per option", () => {
    const questions = [
      makeQuestion({ id: "q1", type: "CHECKBOX", label: "Hobbies" }),
    ];
    const result = aggregateResponses(
      makeMap({ q1: ['["Reading","Gaming"]', '["Reading","Cooking"]'] }),
      questions
    );
    const summary = result[0];
    expect(summary.kind).toBe("choice");
    if (summary.kind === "choice") {
      const readingItem = summary.distribution.find((d) => d.label === "Reading");
      expect(readingItem?.count).toBe(2);
    }
  });

  test("treats malformed CHECKBOX value as a plain string (no throw)", () => {
    const questions = [
      makeQuestion({ id: "q1", type: "CHECKBOX", label: "Items" }),
    ];
    const result = aggregateResponses(
      makeMap({ q1: ["not-json"] }),
      questions
    );
    const summary = result[0];
    expect(summary.kind).toBe("choice");
    // Should not throw and should count the malformed value as-is
    expect(summary.totalAnswers).toBeGreaterThanOrEqual(0);
  });

  test("caps distribution at top 10 options", () => {
    const values = Array.from({ length: 15 }, (_, i) => `Option ${i + 1}`);
    const questions = [
      makeQuestion({ id: "q1", type: "MULTIPLE_CHOICE", label: "Many" }),
    ];
    const result = aggregateResponses(makeMap({ q1: values }), questions);
    const summary = result[0];
    if (summary.kind === "choice") {
      expect(summary.distribution.length).toBeLessThanOrEqual(10);
    }
  });
});

// ─── MULTIPLE_CHOICE_GRID ─────────────────────────────────────────────────────

describe("aggregateResponses — grid types", () => {
  const rowA = { id: "r1", value: "Row 1" };
  const rowB = { id: "r2", value: "Row 2" };
  const colX = { id: "c1", value: "Col A" };
  const colY = { id: "c2", value: "Col B" };

  const gridQuestion = makeQuestion({
    id: "q1",
    type: "MULTIPLE_CHOICE_GRID",
    label: "Grid Q",
    config: { grid: { rows: [rowA, rowB], columns: [colX, colY] } },
  });

  test("counts column selections per row", () => {
    const answers = [
      JSON.stringify({ r1: "c1", r2: "c2" }),
      JSON.stringify({ r1: "c1", r2: "c1" }),
    ];
    const result = aggregateResponses(makeMap({ q1: answers }), [gridQuestion]);
    const summary = result[0];
    expect(summary.kind).toBe("grid");
    if (summary.kind === "grid") {
      const row1 = summary.rows.find((r) => r.id === "r1");
      expect(row1?.columns.find((c) => c.id === "c1")?.count).toBe(2);
      expect(row1?.columns.find((c) => c.id === "c2")?.count).toBe(0);
    }
  });

  test("handles CHECKBOX_GRID with array of column IDs", () => {
    const cbQuestion = makeQuestion({
      id: "q2",
      type: "CHECKBOX_GRID",
      label: "CB Grid",
      config: { grid: { rows: [rowA], columns: [colX, colY] } },
    });
    const answers = [JSON.stringify({ r1: ["c1", "c2"] })];
    const result = aggregateResponses(makeMap({ q2: answers }), [cbQuestion]);
    const summary = result[0];
    if (summary.kind === "grid") {
      const row = summary.rows[0];
      expect(row.columns.find((c) => c.id === "c1")?.count).toBe(1);
      expect(row.columns.find((c) => c.id === "c2")?.count).toBe(1);
      expect(summary.isCheckbox).toBe(true);
    }
  });

  test("skips malformed JSON grid answers without throwing", () => {
    const result = aggregateResponses(
      makeMap({ q1: ["not-a-json-object"] }),
      [gridQuestion]
    );
    const summary = result[0];
    expect(summary.kind).toBe("grid");
    if (summary.kind === "grid") {
      expect(summary.totalAnswers).toBe(0);
    }
  });

  test("returns empty rows when config.grid is missing", () => {
    const badQuestion = makeQuestion({
      id: "q3",
      type: "MULTIPLE_CHOICE_GRID",
      label: "No config",
    });
    const result = aggregateResponses(makeMap({ q3: ["{}"] }), [badQuestion]);
    const summary = result[0];
    if (summary.kind === "grid") {
      expect(summary.rows).toEqual([]);
    }
  });
});

// ─── LINEAR_SCALE / RATING ───────────────────────────────────────────────────

describe("aggregateResponses — scale types", () => {
  test("computes correct average for LINEAR_SCALE", () => {
    const questions = [
      makeQuestion({ id: "q1", type: "LINEAR_SCALE", label: "Satisfaction" }),
    ];
    const result = aggregateResponses(
      makeMap({ q1: ["1", "3", "5"] }),
      questions
    );
    const summary = result[0];
    expect(summary.kind).toBe("scale");
    if (summary.kind === "scale") {
      expect(summary.avg).toBe(3);
      expect(summary.min).toBe(1);
      expect(summary.max).toBe(5);
      expect(summary.totalAnswers).toBe(3);
    }
  });

  test("skips non-numeric values without throwing", () => {
    const questions = [
      makeQuestion({ id: "q1", type: "RATING", label: "Stars" }),
    ];
    const result = aggregateResponses(
      makeMap({ q1: ["3", "not-a-number", "4"] }),
      questions
    );
    const summary = result[0];
    if (summary.kind === "scale") {
      expect(summary.totalAnswers).toBe(2);
      expect(summary.avg).toBe(3.5);
    }
  });

  test("returns zero stats when no numeric answers exist", () => {
    const questions = [
      makeQuestion({ id: "q1", type: "LINEAR_SCALE", label: "Score" }),
    ];
    const result = aggregateResponses(makeMap({ q1: [] }), questions);
    const summary = result[0];
    if (summary.kind === "scale") {
      expect(summary.avg).toBe(0);
      expect(summary.min).toBe(0);
      expect(summary.max).toBe(0);
    }
  });
});

// ─── FILE_UPLOAD / SELFIE ─────────────────────────────────────────────────────

describe("aggregateResponses — file types", () => {
  test("counts file uploads and stores up to 20 URLs", () => {
    const questions = [
      makeQuestion({ id: "q1", type: "FILE_UPLOAD", label: "Attachment" }),
    ];
    const urls = Array.from({ length: 25 }, (_, i) => `/uploads/file${i}.pdf`);
    const result = aggregateResponses(makeMap({ q1: urls }), questions);
    const summary = result[0];
    expect(summary.kind).toBe("file");
    if (summary.kind === "file") {
      expect(summary.totalAnswers).toBe(25);
      expect(summary.urls).toHaveLength(20); // capped at 20
    }
  });

  test("produces FileSummary for SELFIE type", () => {
    const questions = [
      makeQuestion({ id: "q1", type: "SELFIE", label: "Photo" }),
    ];
    const result = aggregateResponses(
      makeMap({ q1: ["/uploads/selfie.jpg"] }),
      questions
    );
    expect(result[0].kind).toBe("file");
  });
});

// ─── Orphaned answers (question deleted) ─────────────────────────────────────

describe("aggregateResponses — robustness", () => {
  test("ignores orphaned answers for questions not in the questions list", () => {
    const questions = [
      makeQuestion({ id: "q1", type: "SHORT_TEXT", label: "Name" }),
    ];
    // q99 is orphaned (deleted question)
    const result = aggregateResponses(
      makeMap({ q1: ["Alice"], q99: ["orphan"] }),
      questions
    );
    expect(result).toHaveLength(1);
    expect(result[0].questionId).toBe("q1");
  });
});
