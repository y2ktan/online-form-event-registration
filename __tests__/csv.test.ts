import { describe, test, expect } from "vitest";
import {
  escapeCsvField,
  responsesToCsv,
  type CsvResponse,
  type CsvQuestion,
} from "../lib/csv";

// ─── escapeCsvField ─────────────────────────────────────────────────

describe("escapeCsvField", () => {
  test("returns plain string as-is", () => {
    expect(escapeCsvField("hello")).toBe("hello");
  });

  test("wraps field containing comma in quotes", () => {
    expect(escapeCsvField("a,b")).toBe('"a,b"');
  });

  test("wraps field containing newline in quotes", () => {
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });

  test("wraps field containing carriage return in quotes", () => {
    expect(escapeCsvField("line1\rline2")).toBe('"line1\rline2"');
  });

  test("escapes double quotes by doubling them", () => {
    expect(escapeCsvField('say "hello"')).toBe('"say ""hello"""');
  });

  test("handles field with both commas and quotes", () => {
    expect(escapeCsvField('"a",b')).toBe('"""a"",b"');
  });

  test("handles empty string", () => {
    expect(escapeCsvField("")).toBe("");
  });
});

// ─── responsesToCsv ─────────────────────────────────────────────────

describe("responsesToCsv", () => {
  const questions: CsvQuestion[] = [
    { id: "q1", label: "Name", type: "SHORT_TEXT" },
    { id: "q2", label: "Hobbies", type: "CHECKBOX" },
  ];

  test("generates header row with phone when includePhone is true", () => {
    const csv = responsesToCsv([], questions, true);
    const header = csv.split("\n")[0];
    expect(header).toBe("Submission ID,Phone,Submitted At,Updated At,Name,Hobbies");
  });

  test("generates header row without phone when includePhone is false", () => {
    const csv = responsesToCsv([], questions, false);
    const header = csv.split("\n")[0];
    expect(header).toBe("Submission ID,Submitted At,Updated At,Name,Hobbies");
  });

  test("generates correct data rows", () => {
    const responses: CsvResponse[] = [
      {
        shortCode: "ABC123",
        phoneNumber: "+60123",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-02T00:00:00Z",
        answers: [
          { questionId: "q1", value: "Alice" },
          { questionId: "q2", value: '["Reading","Gaming"]' },
        ],
      },
    ];
    const csv = responsesToCsv(responses, questions, true);
    const rows = csv.split("\n");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toBe("ABC123,+60123,2025-01-01T00:00:00Z,2025-01-02T00:00:00Z,Alice,Reading; Gaming");
  });

  test("handles missing answers with empty string", () => {
    const responses: CsvResponse[] = [
      {
        shortCode: "XYZ",
        phoneNumber: null,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        answers: [], // no answers at all
      },
    ];
    const csv = responsesToCsv(responses, questions, true);
    const rows = csv.split("\n");
    expect(rows[1]).toBe("XYZ,,2025-01-01T00:00:00Z,2025-01-01T00:00:00Z,,");
  });

  test("escapes values containing commas or quotes", () => {
    const responses: CsvResponse[] = [
      {
        shortCode: "A1",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        answers: [{ questionId: "q1", value: 'O"Brien, Jr.' }],
      },
    ];
    const csv = responsesToCsv(responses, [questions[0]], false);
    const rows = csv.split("\n");
    // The value should be escaped: "O""Brien, Jr."
    expect(rows[1]).toContain('"O""Brien');
  });

  test("formats grid answers as key-value pairs", () => {
    const gridQ: CsvQuestion[] = [
      { id: "g1", label: "Grid", type: "MULTIPLE_CHOICE_GRID", config: {
        grid: {
          rows: [{ id: "r1", value: "Row 1" }, { id: "r2", value: "Row 2" }],
          columns: [{ id: "c1", value: "Col A" }, { id: "c2", value: "Col B" }],
        },
      }},
    ];
    const responses: CsvResponse[] = [
      {
        shortCode: "G1",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        answers: [{ questionId: "g1", value: '{"r1":"c1","r2":"c2"}' }],
      },
    ];
    const csv = responsesToCsv(responses, gridQ, false);
    const rows = csv.split("\n");
    expect(rows[1]).toContain("Row 1: Col A; Row 2: Col B");
  });

  test("formats grid answers falling back to raw keys when no config", () => {
    const gridQ: CsvQuestion[] = [
      { id: "g1", label: "Grid", type: "MULTIPLE_CHOICE_GRID" },
    ];
    const responses: CsvResponse[] = [
      {
        shortCode: "G1",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        answers: [{ questionId: "g1", value: '{"Row1":"Col A","Row2":"Col B"}' }],
      },
    ];
    const csv = responsesToCsv(responses, gridQ, false);
    const rows = csv.split("\n");
    expect(rows[1]).toContain("Row1: Col A; Row2: Col B");
  });

  test("handles checkbox grid answers with UUID resolution", () => {
    const gridQ: CsvQuestion[] = [
      { id: "g2", label: "CGrid", type: "CHECKBOX_GRID", config: {
        grid: {
          rows: [{ id: "r1", value: "Date 1" }],
          columns: [{ id: "c1", value: "Morning" }, { id: "c2", value: "Afternoon" }],
        },
      }},
    ];
    const responses: CsvResponse[] = [
      {
        shortCode: "G2",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        answers: [{ questionId: "g2", value: '{"r1":["c1","c2"]}' }],
      },
    ];
    const csv = responsesToCsv(responses, gridQ, false);
    const rows = csv.split("\n");
    expect(rows[1]).toContain("Date 1: Morning, Afternoon");
  });

  test("handles empty questions list", () => {
    const csv = responsesToCsv([], [], false);
    expect(csv).toBe("Submission ID,Submitted At,Updated At");
  });

  test("uses 'Untitled' for questions with empty label", () => {
    const csv = responsesToCsv([], [{ id: "x", label: "", type: "SHORT_TEXT" }], false);
    expect(csv).toContain("Untitled");
  });

  test("handles multiple responses in order", () => {
    const responses: CsvResponse[] = [
      {
        shortCode: "A1",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        answers: [{ questionId: "q1", value: "First" }],
      },
      {
        shortCode: "B2",
        createdAt: "2025-01-02T00:00:00Z",
        updatedAt: "2025-01-02T00:00:00Z",
        answers: [{ questionId: "q1", value: "Second" }],
      },
    ];
    const csv = responsesToCsv(responses, [questions[0]], false);
    const rows = csv.split("\n");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toContain("First");
    expect(rows[2]).toContain("Second");
  });
});

// ─── Performance ────────────────────────────────────────────────────

describe("performance", () => {
  test("escapeCsvField is O(n) — 10k calls under 50ms", () => {
    const field = "a".repeat(200);
    const start = performance.now();
    for (let i = 0; i < 10_000; i++) escapeCsvField(field);
    expect(performance.now() - start).toBeLessThan(50);
  });

  test("responsesToCsv handles 1000 responses × 20 questions under 100ms", () => {
    const questions: CsvQuestion[] = Array.from({ length: 20 }, (_, i) => ({
      id: `q${i}`,
      label: `Question ${i}`,
      type: "SHORT_TEXT",
    }));
    const responses: CsvResponse[] = Array.from({ length: 1000 }, (_, i) => ({
      shortCode: `SC${i}`,
      phoneNumber: `+6012${i}`,
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
      answers: questions.map((q) => ({ questionId: q.id, value: `Answer ${i}` })),
    }));
    const start = performance.now();
    const csv = responsesToCsv(responses, questions, true);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
    expect(csv.split("\n")).toHaveLength(1001); // header + 1000 rows
  });
});
