// @vitest-environment node
import { describe, test, expect } from "vitest";
import * as ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import {
  formatAnswerForXlsx,
  makeBar,
  buildResponsesSheet,
  buildAnalyticsSheet,
  buildUserProfileSheet,
  generateXlsxBuffer,
  type XlsxResponse,
  type XlsxQuestion,
  type UserProfileData,
} from "../lib/xlsx-export";
import type {
  SectionSummary,
  ChoiceSummary,
  ScaleSummary,
  TextSummary,
  GridSummary,
  FileSummary,
} from "../lib/summary-helpers";

// ─── makeBar ────────────────────────────────────────────────────────

describe("makeBar", () => {
  test("returns empty string for 0%", () => {
    expect(makeBar(0)).toBe("");
  });

  test("returns full bar for 100%", () => {
    expect(makeBar(100)).toBe("\u2588".repeat(20));
  });

  test("returns ~half bar for 50%", () => {
    expect(makeBar(50)).toBe("\u2588".repeat(10));
  });

  test("clamps negative to 0", () => {
    expect(makeBar(-10)).toBe("");
  });

  test("clamps >100 to 100", () => {
    expect(makeBar(150)).toBe("\u2588".repeat(20));
  });

  test("respects custom maxBlocks", () => {
    expect(makeBar(100, 10)).toBe("\u2588".repeat(10));
  });
});

// ─── formatAnswerForXlsx ────────────────────────────────────────────

describe("formatAnswerForXlsx", () => {
  test("returns empty string for empty value", () => {
    expect(formatAnswerForXlsx("", "SHORT_TEXT")).toBe("");
  });

  test("returns plain value for SHORT_TEXT", () => {
    expect(formatAnswerForXlsx("hello", "SHORT_TEXT")).toBe("hello");
  });

  test("converts SELFIE path to absolute URL", () => {
    expect(formatAnswerForXlsx("/uploads/photo.jpg", "SELFIE", "https://example.com"))
      .toBe("https://example.com/uploads/photo.jpg");
  });

  test("returns raw SELFIE path when no baseUrl", () => {
    expect(formatAnswerForXlsx("/uploads/photo.jpg", "SELFIE")).toBe("/uploads/photo.jpg");
  });

  test("does not convert SELFIE if not starting with /", () => {
    expect(formatAnswerForXlsx("photo.jpg", "SELFIE", "https://example.com"))
      .toBe("photo.jpg");
  });

  test("joins CHECKBOX array with semicolons", () => {
    expect(formatAnswerForXlsx('["A","B","C"]', "CHECKBOX")).toBe("A; B; C");
  });

  test("returns raw value for non-array CHECKBOX", () => {
    expect(formatAnswerForXlsx("single", "CHECKBOX")).toBe("single");
  });

  test("formats MULTIPLE_CHOICE_GRID", () => {
    const config = JSON.stringify({
      grid: {
        rows: [{ id: "r1", value: "Row 1" }],
        columns: [{ id: "c1", value: "Col 1" }, { id: "c2", value: "Col 2" }],
      },
    });
    const val = JSON.stringify({ r1: "c1" });
    expect(formatAnswerForXlsx(val, "MULTIPLE_CHOICE_GRID", undefined, config))
      .toBe("Row 1: Col 1");
  });

  test("formats CHECKBOX_GRID with arrays", () => {
    const config = {
      grid: {
        rows: [{ id: "r1", value: "Row 1" }],
        columns: [{ id: "c1", value: "Col A" }, { id: "c2", value: "Col B" }],
      },
    };
    const val = JSON.stringify({ r1: ["c1", "c2"] });
    expect(formatAnswerForXlsx(val, "CHECKBOX_GRID", undefined, config))
      .toBe("Row 1: Col A, Col B");
  });

  test("handles malformed JSON gracefully", () => {
    expect(formatAnswerForXlsx("{bad json", "MULTIPLE_CHOICE_GRID")).toBe("{bad json");
  });
});

// ─── buildResponsesSheet ────────────────────────────────────────────

describe("buildResponsesSheet", () => {
  const questions: XlsxQuestion[] = [
    { id: "q1", label: "Name", type: "SHORT_TEXT" },
    { id: "q2", label: "Color", type: "MULTIPLE_CHOICE" },
  ];
  const responses: XlsxResponse[] = [
    {
      shortCode: "ABC",
      phoneNumber: "+1234",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T01:00:00Z",
      answers: [
        { questionId: "q1", value: "Alice" },
        { questionId: "q2", value: "Blue" },
      ],
      isNewUser: false,
    },
  ];

  test("creates headers with phone", () => {
    const wb = new ExcelJS.Workbook();
    buildResponsesSheet(wb, responses, questions, true);
    const ws = wb.getWorksheet("Raw Responses")!;
    const row = ws.getRow(1);
    expect(row.getCell(1).value).toBe("Submission ID");
    expect(row.getCell(2).value).toBe("Phone");
    expect(row.getCell(3).value).toBe("Submitted At");
    expect(row.getCell(4).value).toBe("Updated At");
    expect(row.getCell(5).value).toBe("Name");
    expect(row.getCell(6).value).toBe("Color");
  });

  test("creates headers without phone", () => {
    const wb = new ExcelJS.Workbook();
    buildResponsesSheet(wb, responses, questions, false);
    const ws = wb.getWorksheet("Raw Responses")!;
    const row = ws.getRow(1);
    expect(row.getCell(1).value).toBe("Submission ID");
    expect(row.getCell(2).value).toBe("Submitted At");
  });

  test("includes Is New User column when enabled", () => {
    const wb = new ExcelJS.Workbook();
    buildResponsesSheet(wb, responses, questions, false, undefined, true);
    const ws = wb.getWorksheet("Raw Responses")!;
    const headerRow = ws.getRow(1);
    // Without phone: SubmitID, SubmittedAt, UpdatedAt, Name, Color, IsNewUser = 6 cols
    expect(headerRow.getCell(6).value).toBe("Is New User");
    // Data row
    expect(ws.getRow(2).getCell(6).value).toBe("No");
  });

  test("populates data rows correctly", () => {
    const wb = new ExcelJS.Workbook();
    buildResponsesSheet(wb, responses, questions, true);
    const ws = wb.getWorksheet("Raw Responses")!;
    const row = ws.getRow(2);
    expect(row.getCell(1).value).toBe("ABC");
    expect(row.getCell(2).value).toBe("+1234");
    expect(row.getCell(5).value).toBe("Alice");
    expect(row.getCell(6).value).toBe("Blue");
  });

  test("handles empty responses", () => {
    const wb = new ExcelJS.Workbook();
    buildResponsesSheet(wb, [], questions, false);
    const ws = wb.getWorksheet("Raw Responses")!;
    expect(ws.rowCount).toBe(1); // header only
  });

  test("replaces SELFIE label with Profile Photo", () => {
    const wb = new ExcelJS.Workbook();
    buildResponsesSheet(wb, [], [{ id: "q1", label: "Photo", type: "SELFIE" }], false);
    const ws = wb.getWorksheet("Raw Responses")!;
    expect(ws.getRow(1).getCell(4).value).toBe("Profile Photo");
  });

  test("has frozen header row", () => {
    const wb = new ExcelJS.Workbook();
    buildResponsesSheet(wb, responses, questions, false);
    const ws = wb.getWorksheet("Raw Responses")!;
    expect(ws.views).toBeDefined();
    expect(ws.views[0]?.state).toBe("frozen");
  });
});

// ─── buildAnalyticsSheet ────────────────────────────────────────────

describe("buildAnalyticsSheet", () => {
  const choiceQ: ChoiceSummary = {
    kind: "choice",
    questionId: "q1",
    label: "Favorite Color",
    type: "MULTIPLE_CHOICE",
    totalAnswers: 10,
    distribution: [
      { label: "Blue", count: 6, percent: 60 },
      { label: "Red", count: 4, percent: 40 },
    ],
  };

  const scaleQ: ScaleSummary = {
    kind: "scale",
    questionId: "q2",
    label: "Rating",
    type: "LINEAR_SCALE",
    totalAnswers: 5,
    min: 1,
    max: 5,
    avg: 3.2,
    distribution: [
      { value: 1, count: 1 },
      { value: 3, count: 2 },
      { value: 5, count: 2 },
    ],
  };

  const textQ: TextSummary = {
    kind: "text",
    questionId: "q3",
    label: "Name",
    type: "SHORT_TEXT",
    totalAnswers: 3,
    uniqueCount: 2,
    recentEntries: ["Alice", "Bob"],
  };

  const fileQ: FileSummary = {
    kind: "file",
    questionId: "q4",
    label: "Upload",
    type: "FILE_UPLOAD",
    totalAnswers: 2,
    urls: ["/uploads/a.pdf", "/uploads/b.pdf"],
  };

  const gridQ: GridSummary = {
    kind: "grid",
    questionId: "q5",
    label: "Schedule",
    type: "MULTIPLE_CHOICE_GRID",
    isCheckbox: false,
    totalAnswers: 3,
    rows: [
      {
        id: "r1",
        label: "Morning",
        columns: [
          { id: "c1", label: "Mon", count: 2 },
          { id: "c2", label: "Tue", count: 1 },
        ],
      },
    ],
  };

  const sections: SectionSummary[] = [
    {
      id: "s1",
      title: "Section 1",
      order: 0,
      questions: [choiceQ, scaleQ, textQ, fileQ, gridQ],
    },
  ];

  test("includes title and total responses", () => {
    const wb = new ExcelJS.Workbook();
    buildAnalyticsSheet(wb, sections, 42);
    const ws = wb.getWorksheet("Data Analytics")!;
    expect(ws.getRow(1).getCell(1).value).toBe("DATA ANALYTICS SUMMARY");
    expect(ws.getRow(2).getCell(2).value).toBe(42);
  });

  test("includes section header", () => {
    const wb = new ExcelJS.Workbook();
    buildAnalyticsSheet(wb, sections, 10);
    const ws = wb.getWorksheet("Data Analytics")!;
    // Row 1: title, Row 2: total, Row 3: blank, Row 4: section
    expect(String(ws.getRow(4).getCell(1).value)).toContain("Section: Section 1");
  });

  test("renders choice distribution with bars", () => {
    const wb = new ExcelJS.Workbook();
    buildAnalyticsSheet(wb, [{ id: "s1", title: "S1", order: 0, questions: [choiceQ] }], 10);
    const ws = wb.getWorksheet("Data Analytics")!;
    // Find the "Blue" row
    let blueRow: ExcelJS.Row | undefined;
    ws.eachRow((row) => {
      if (row.getCell(1).value === "Blue") blueRow = row;
    });
    expect(blueRow).toBeDefined();
    expect(blueRow!.getCell(2).value).toBe(6);
    expect(blueRow!.getCell(3).value).toBe("60%");
    // Bar column should have block chars
    const bar = String(blueRow!.getCell(4).value ?? "");
    expect(bar).toContain("\u2588");
  });

  test("renders scale statistics", () => {
    const wb = new ExcelJS.Workbook();
    buildAnalyticsSheet(wb, [{ id: "s1", title: "S1", order: 0, questions: [scaleQ] }], 10);
    const ws = wb.getWorksheet("Data Analytics")!;
    let minRow: ExcelJS.Row | undefined;
    let maxRow: ExcelJS.Row | undefined;
    let avgRow: ExcelJS.Row | undefined;
    ws.eachRow((row) => {
      const v = row.getCell(1).value;
      if (v === "Min") minRow = row;
      if (v === "Max") maxRow = row;
      if (v === "Average") avgRow = row;
    });
    expect(minRow!.getCell(2).value).toBe(1);
    expect(maxRow!.getCell(2).value).toBe(5);
    expect(avgRow!.getCell(2).value).toBe(3.2);
  });

  test("renders text summary with unique count", () => {
    const wb = new ExcelJS.Workbook();
    buildAnalyticsSheet(wb, [{ id: "s1", title: "S1", order: 0, questions: [textQ] }], 10);
    const ws = wb.getWorksheet("Data Analytics")!;
    let uniqueRow: ExcelJS.Row | undefined;
    ws.eachRow((row) => {
      if (row.getCell(1).value === "Unique answers") uniqueRow = row;
    });
    expect(uniqueRow).toBeDefined();
    expect(uniqueRow!.getCell(2).value).toBe(2);
  });

  test("renders file summary", () => {
    const wb = new ExcelJS.Workbook();
    buildAnalyticsSheet(wb, [{ id: "s1", title: "S1", order: 0, questions: [fileQ] }], 10);
    const ws = wb.getWorksheet("Data Analytics")!;
    let found = false;
    ws.eachRow((row) => {
      if (String(row.getCell(1).value ?? "").includes("/uploads/a.pdf")) found = true;
    });
    expect(found).toBe(true);
  });

  test("renders grid matrix with heatmap", () => {
    const wb = new ExcelJS.Workbook();
    buildAnalyticsSheet(wb, [{ id: "s1", title: "S1", order: 0, questions: [gridQ] }], 10);
    const ws = wb.getWorksheet("Data Analytics")!;
    // Find Morning row
    let morningRow: ExcelJS.Row | undefined;
    ws.eachRow((row) => {
      if (row.getCell(1).value === "Morning") morningRow = row;
    });
    expect(morningRow).toBeDefined();
    expect(morningRow!.getCell(2).value).toBe(2);
    expect(morningRow!.getCell(3).value).toBe(1);
  });

  test("handles empty sections", () => {
    const wb = new ExcelJS.Workbook();
    buildAnalyticsSheet(wb, [], 0);
    const ws = wb.getWorksheet("Data Analytics")!;
    expect(ws.getRow(1).getCell(1).value).toBe("DATA ANALYTICS SUMMARY");
    expect(ws.getRow(2).getCell(2).value).toBe(0);
  });

  test("sets column widths", () => {
    const wb = new ExcelJS.Workbook();
    buildAnalyticsSheet(wb, sections, 10);
    const ws = wb.getWorksheet("Data Analytics")!;
    expect(ws.getColumn(1).width).toBe(35);
    expect(ws.getColumn(4).width).toBe(28);
  });
});

// ─── buildUserProfileSheet ──────────────────────────────────────────

describe("buildUserProfileSheet", () => {
  const profile: UserProfileData = {
    stats: {
      userProfileCount: 100,
      respondedRegistered: 60,
      notYetRegistered: 40,
      newUsers: 15,
      totalResponses: 75,
    },
    headers: ["IC", "Name", "Email"],
    rows: [
      { IC: "123", Name: "Alice", Email: "alice@test.com" },
      { IC: "456", Name: "Bob", Email: "bob@test.com" },
    ],
    lookupColumn: "IC",
    respondedValues: new Set(["123"]),
  };

  test("includes title", () => {
    const wb = new ExcelJS.Workbook();
    buildUserProfileSheet(wb, profile);
    const ws = wb.getWorksheet("User Profile")!;
    expect(ws.getRow(1).getCell(1).value).toBe("USER PROFILE ANALYTICS");
  });

  test("includes summary statistics with bars", () => {
    const wb = new ExcelJS.Workbook();
    buildUserProfileSheet(wb, profile);
    const ws = wb.getWorksheet("User Profile")!;
    let regRow: ExcelJS.Row | undefined;
    let respRow: ExcelJS.Row | undefined;
    let notRow: ExcelJS.Row | undefined;
    let newRow: ExcelJS.Row | undefined;
    ws.eachRow((row) => {
      const v = row.getCell(1).value;
      if (v === "Total Registered Users") regRow = row;
      if (v === "Responded (Registered)") respRow = row;
      if (v === "Not Yet Responded") notRow = row;
      if (v === "New Users (Unregistered)") newRow = row;
    });
    expect(regRow!.getCell(2).value).toBe(100);
    expect(respRow!.getCell(2).value).toBe(60);
    expect(notRow!.getCell(2).value).toBe(40);
    expect(newRow!.getCell(2).value).toBe(15);
    // Bars should be present
    expect(String(respRow!.getCell(4).value ?? "")).toContain("\u2588");
    expect(String(notRow!.getCell(4).value ?? "")).toContain("\u2588");
    expect(String(newRow!.getCell(4).value ?? "")).toContain("\u2588");
  });

  test("includes detailed user table with response status", () => {
    const wb = new ExcelJS.Workbook();
    buildUserProfileSheet(wb, profile);
    const ws = wb.getWorksheet("User Profile")!;
    // Find Alice and Bob rows
    let aliceRow: ExcelJS.Row | undefined;
    let bobRow: ExcelJS.Row | undefined;
    ws.eachRow((row) => {
      if (row.getCell(1).value === "123") aliceRow = row;
      if (row.getCell(1).value === "456") bobRow = row;
    });
    expect(aliceRow).toBeDefined();
    expect(aliceRow!.getCell(2).value).toBe("Alice");
    expect(aliceRow!.getCell(4).value).toBe("✓ Responded");
    expect(bobRow).toBeDefined();
    expect(bobRow!.getCell(4).value).toBe("✗ Not Responded");
  });

  test("handles empty profile rows", () => {
    const empty: UserProfileData = {
      stats: { userProfileCount: 0, respondedRegistered: 0, notYetRegistered: 0, newUsers: 0, totalResponses: 0 },
      headers: [],
      rows: [],
      lookupColumn: "",
      respondedValues: new Set(),
    };
    const wb = new ExcelJS.Workbook();
    buildUserProfileSheet(wb, empty);
    const ws = wb.getWorksheet("User Profile")!;
    expect(ws.getRow(1).getCell(1).value).toBe("USER PROFILE ANALYTICS");
  });

  test("sets column widths", () => {
    const wb = new ExcelJS.Workbook();
    buildUserProfileSheet(wb, profile);
    const ws = wb.getWorksheet("User Profile")!;
    expect(ws.getColumn(1).width).toBe(30);
    expect(ws.getColumn(4).width).toBe(28);
  });
});

// ─── generateXlsxBuffer ────────────────────────────────────────────

describe("generateXlsxBuffer", () => {
  const questions: XlsxQuestion[] = [
    { id: "q1", label: "Name", type: "SHORT_TEXT" },
  ];
  const responses: XlsxResponse[] = [
    {
      shortCode: "X1",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      answers: [{ questionId: "q1", value: "Test" }],
    },
  ];
  const sections: SectionSummary[] = [
    {
      id: "s1",
      title: "Sec",
      order: 0,
      questions: [
        {
          kind: "text" as const,
          questionId: "q1",
          label: "Name",
          type: "SHORT_TEXT",
          totalAnswers: 1,
          uniqueCount: 1,
          recentEntries: ["Test"],
        },
      ],
    },
  ];

  test("returns a Buffer", async () => {
    const buf = await generateXlsxBuffer({
      responses,
      questions,
      includePhone: false,
      includeNewUser: false,
      sections,
      totalResponses: 1,
    });
    expect(buf instanceof ArrayBuffer).toBe(true);
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  test("produces valid XLSX with 2 sheets when no user profile", async () => {
    const buf = await generateXlsxBuffer({
      responses,
      questions,
      includePhone: false,
      includeNewUser: false,
      sections,
      totalResponses: 1,
    });
    const readWb = XLSX.read(buf, { type: "buffer" });
    expect(readWb.SheetNames).toEqual(["Raw Responses", "Data Analytics"]);
  });

  test("produces 3 sheets when user profile is provided", async () => {
    const userProfile: UserProfileData = {
      stats: { userProfileCount: 1, respondedRegistered: 0, notYetRegistered: 1, newUsers: 1, totalResponses: 1 },
      headers: ["IC"],
      rows: [{ IC: "999" }],
      lookupColumn: "IC",
      respondedValues: new Set(),
    };
    const buf = await generateXlsxBuffer({
      responses,
      questions,
      includePhone: false,
      includeNewUser: true,
      sections,
      totalResponses: 1,
      userProfile,
    });
    const readWb = XLSX.read(buf, { type: "buffer" });
    expect(readWb.SheetNames).toEqual(["Raw Responses", "Data Analytics", "User Profile"]);
  });

  test("Raw Responses sheet has correct data", async () => {
    const buf = await generateXlsxBuffer({
      responses,
      questions,
      includePhone: false,
      includeNewUser: false,
      sections,
      totalResponses: 1,
    });
    const readWb = XLSX.read(buf, { type: "buffer" });
    const ws = readWb.Sheets["Raw Responses"];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    // Without phone: Submission ID(0), Submitted At(1), Updated At(2), Name(3)
    expect(data[0]).toContain("Submission ID");
    expect(data[0]).toContain("Name");
    expect(data[1][0]).toBe("X1");
    expect(data[1][3]).toBe("Test");
  });

  test("Data Analytics sheet includes total responses", async () => {
    const buf = await generateXlsxBuffer({
      responses, questions,
      includePhone: false,
      includeNewUser: false,
      sections,
      totalResponses: 42,
    });
    const readWb = XLSX.read(buf, { type: "buffer" });
    const ws = readWb.Sheets["Data Analytics"];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    expect(data[1][1]).toBe(42);
  });

  test("round-trip: buffer can be read back by ExcelJS", async () => {
    const buf = await generateXlsxBuffer({
      responses, questions,
      includePhone: true,
      includeNewUser: false,
      sections,
      totalResponses: 1,
    });
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buf as ArrayBuffer);
    expect(wb2.getWorksheet("Raw Responses")).toBeDefined();
    expect(wb2.getWorksheet("Data Analytics")).toBeDefined();
  });
});
