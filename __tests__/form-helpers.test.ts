import { describe, test, expect } from "vitest";
import {
  findSectionForQuestion,
  moveQuestionBetweenSections,
  reorderQuestionWithinSection,
  updateRoutingOnOptionRename,
  removeRoutingForOption,
} from "../lib/form-helpers";

// ─── Test data factories ────────────────────────────────────────────

function makeQuestion(id: string, order: number) {
  return { id, order, label: `Q-${id}`, type: "SHORT_TEXT", isRequired: false, options: [], config: {} };
}

function makeSection(id: string, questionIds: string[]) {
  return {
    id,
    title: `Section ${id}`,
    description: "",
    order: 0,
    routingConfig: {},
    questions: questionIds.map((qId, i) => makeQuestion(qId, i)),
  };
}

// ─── findSectionForQuestion ─────────────────────────────────────────

describe("findSectionForQuestion", () => {
  const sections = [
    makeSection("s1", ["q1", "q2"]),
    makeSection("s2", ["q3"]),
    makeSection("s3", []),
  ];

  test("finds question in first section", () => {
    expect(findSectionForQuestion(sections, "q1")).toEqual({ sIdx: 0, qIdx: 0 });
    expect(findSectionForQuestion(sections, "q2")).toEqual({ sIdx: 0, qIdx: 1 });
  });

  test("finds question in second section", () => {
    expect(findSectionForQuestion(sections, "q3")).toEqual({ sIdx: 1, qIdx: 0 });
  });

  test("returns null for nonexistent question", () => {
    expect(findSectionForQuestion(sections, "q99")).toBeNull();
  });

  test("returns null for empty sections array", () => {
    expect(findSectionForQuestion([], "q1")).toBeNull();
  });
});

// ─── moveQuestionBetweenSections ────────────────────────────────────

describe("moveQuestionBetweenSections", () => {
  test("moves question from section 0 to section 1 (over a question)", () => {
    const sections = [
      makeSection("s1", ["q1", "q2"]),
      makeSection("s2", ["q3", "q4"]),
    ];
    const result = moveQuestionBetweenSections(sections, "q1", "q3");
    expect(result).not.toBeNull();
    expect(result![0].questions.map((q) => q.id)).toEqual(["q2"]);
    expect(result![1].questions.map((q) => q.id)).toEqual(["q1", "q3", "q4"]);
  });

  test("moves question into an empty section (over section id)", () => {
    const sections = [
      makeSection("s1", ["q1", "q2"]),
      makeSection("s2", []),
    ];
    const result = moveQuestionBetweenSections(sections, "q1", "s2");
    expect(result).not.toBeNull();
    expect(result![0].questions.map((q) => q.id)).toEqual(["q2"]);
    expect(result![1].questions.map((q) => q.id)).toEqual(["q1"]);
  });

  test("updates order fields after move", () => {
    const sections = [
      makeSection("s1", ["q1", "q2", "q3"]),
      makeSection("s2", ["q4"]),
    ];
    const result = moveQuestionBetweenSections(sections, "q2", "q4");
    expect(result).not.toBeNull();
    // Source section orders
    expect(result![0].questions.map((q) => q.order)).toEqual([0, 1]);
    // Target section orders
    expect(result![1].questions.map((q) => q.order)).toEqual([0, 1]);
  });

  test("returns null for same-section move", () => {
    const sections = [makeSection("s1", ["q1", "q2"])];
    expect(moveQuestionBetweenSections(sections, "q1", "q2")).toBeNull();
  });

  test("returns null for nonexistent active id", () => {
    const sections = [makeSection("s1", ["q1"]), makeSection("s2", ["q2"])];
    expect(moveQuestionBetweenSections(sections, "q99", "q2")).toBeNull();
  });

  test("returns null for nonexistent over id", () => {
    const sections = [makeSection("s1", ["q1"]), makeSection("s2", ["q2"])];
    expect(moveQuestionBetweenSections(sections, "q1", "q99")).toBeNull();
  });

  test("does not mutate original sections", () => {
    const sections = [
      makeSection("s1", ["q1", "q2"]),
      makeSection("s2", ["q3"]),
    ];
    const originalS1Ids = sections[0].questions.map((q) => q.id);
    moveQuestionBetweenSections(sections, "q1", "q3");
    expect(sections[0].questions.map((q) => q.id)).toEqual(originalS1Ids);
  });
});

// ─── reorderQuestionWithinSection ───────────────────────────────────

describe("reorderQuestionWithinSection", () => {
  test("reorders within the same section", () => {
    const sections = [makeSection("s1", ["q1", "q2", "q3"])];
    const result = reorderQuestionWithinSection(sections, "q1", "q3");
    expect(result).not.toBeNull();
    expect(result![0].questions.map((q) => q.id)).toEqual(["q2", "q3", "q1"]);
  });

  test("updates order fields after reorder", () => {
    const sections = [makeSection("s1", ["q1", "q2", "q3"])];
    const result = reorderQuestionWithinSection(sections, "q3", "q1");
    expect(result).not.toBeNull();
    expect(result![0].questions.map((q) => q.order)).toEqual([0, 1, 2]);
  });

  test("returns null for cross-section ids", () => {
    const sections = [
      makeSection("s1", ["q1"]),
      makeSection("s2", ["q2"]),
    ];
    expect(reorderQuestionWithinSection(sections, "q1", "q2")).toBeNull();
  });

  test("returns null for nonexistent ids", () => {
    const sections = [makeSection("s1", ["q1", "q2"])];
    expect(reorderQuestionWithinSection(sections, "q1", "q99")).toBeNull();
    expect(reorderQuestionWithinSection(sections, "q99", "q1")).toBeNull();
  });

  test("does not mutate original sections", () => {
    const sections = [makeSection("s1", ["q1", "q2", "q3"])];
    const originalIds = sections[0].questions.map((q) => q.id);
    reorderQuestionWithinSection(sections, "q1", "q3");
    expect(sections[0].questions.map((q) => q.id)).toEqual(originalIds);
  });
});

// ─── updateRoutingOnOptionRename ────────────────────────────────────

describe("updateRoutingOnOptionRename", () => {
  test("renames routing rule key when option value changes", () => {
    const config = {
      routing: { enabled: true, type: "OPTION_MATCH" as const, rules: { Yes: "s2", No: "SUBMIT" } },
    };
    const result = updateRoutingOnOptionRename(config, "Yes", "Oui");
    expect(result.routing).toEqual({
      enabled: true,
      type: "OPTION_MATCH",
      rules: { Oui: "s2", No: "SUBMIT" },
    });
  });

  test("returns original config if option not in rules", () => {
    const config = {
      routing: { enabled: true, type: "OPTION_MATCH" as const, rules: { Yes: "s2" } },
    };
    const result = updateRoutingOnOptionRename(config, "Maybe", "Perhaps");
    expect(result).toBe(config);
  });

  test("returns original config if routing is disabled", () => {
    const config = {
      routing: { enabled: false, type: "OPTION_MATCH" as const, rules: { Yes: "s2" } },
    };
    const result = updateRoutingOnOptionRename(config, "Yes", "Oui");
    expect(result).toBe(config);
  });

  test("returns original config if routing type is not OPTION_MATCH", () => {
    const config = {
      routing: { enabled: true, type: "CHECKBOX" as const, rules: [] },
    };
    const result = updateRoutingOnOptionRename(config as any, "A", "B");
    expect(result).toBe(config);
  });

  test("returns original config if no routing", () => {
    const config = {};
    expect(updateRoutingOnOptionRename(config, "A", "B")).toBe(config);
  });

  test("does not mutate original config", () => {
    const config = {
      routing: { enabled: true, type: "OPTION_MATCH" as const, rules: { Yes: "s2", No: "SUBMIT" } },
    };
    updateRoutingOnOptionRename(config, "Yes", "Oui");
    expect(config.routing.rules).toEqual({ Yes: "s2", No: "SUBMIT" });
  });
});

// ─── removeRoutingForOption ─────────────────────────────────────────

describe("removeRoutingForOption", () => {
  test("removes routing rule for deleted option", () => {
    const config = {
      routing: { enabled: true, type: "OPTION_MATCH" as const, rules: { Yes: "s2", No: "SUBMIT" } },
    };
    const result = removeRoutingForOption(config, "Yes");
    expect(result.routing).toEqual({
      enabled: true,
      type: "OPTION_MATCH",
      rules: { No: "SUBMIT" },
    });
  });

  test("returns original config if option not in rules", () => {
    const config = {
      routing: { enabled: true, type: "OPTION_MATCH" as const, rules: { Yes: "s2" } },
    };
    expect(removeRoutingForOption(config, "Maybe")).toBe(config);
  });

  test("returns original config if routing disabled", () => {
    const config = {
      routing: { enabled: false, type: "OPTION_MATCH" as const, rules: { Yes: "s2" } },
    };
    expect(removeRoutingForOption(config, "Yes")).toBe(config);
  });

  test("returns original config if no routing", () => {
    const config = {};
    expect(removeRoutingForOption(config, "A")).toBe(config);
  });

  test("does not mutate original config", () => {
    const config = {
      routing: { enabled: true, type: "OPTION_MATCH" as const, rules: { Yes: "s2", No: "SUBMIT" } },
    };
    removeRoutingForOption(config, "Yes");
    expect(config.routing.rules).toEqual({ Yes: "s2", No: "SUBMIT" });
  });
});
