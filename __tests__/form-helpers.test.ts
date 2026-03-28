import { describe, test, expect } from "vitest";
import {
  findSectionForQuestion,
  moveQuestionBetweenSections,
  reorderQuestionWithinSection,
  updateRoutingOnOptionRename,
  removeRoutingForOption,
  removeSectionWithQuestions,
  FormHistory,
  isOtherSelectedForRadio,
  isOtherCheckedForCheckbox,
  toggleOtherInCheckbox,
  updateOtherTextInCheckbox,
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

// ─── isOtherSelectedForRadio ────────────────────────────────────────

describe("isOtherSelectedForRadio", () => {
  const predefined = new Set(["Option A", "Option B"]);

  test("returns true when answer is not a predefined option", () => {
    expect(isOtherSelectedForRadio("Custom answer", predefined)).toBe(true);
  });

  test("returns false when answer matches a predefined option", () => {
    expect(isOtherSelectedForRadio("Option A", predefined)).toBe(false);
  });

  test("returns false when answer is undefined", () => {
    expect(isOtherSelectedForRadio(undefined, predefined)).toBe(false);
  });

  test("returns true for empty string (Other selected, no text yet)", () => {
    expect(isOtherSelectedForRadio("", predefined)).toBe(true);
  });
});

// ─── isOtherCheckedForCheckbox ──────────────────────────────────────

describe("isOtherCheckedForCheckbox", () => {
  const predefined = new Set(["Red", "Blue"]);

  test("returns true when array contains a non-predefined value", () => {
    expect(isOtherCheckedForCheckbox(JSON.stringify(["Red", "Custom"]), predefined)).toBe(true);
  });

  test("returns false when all values are predefined", () => {
    expect(isOtherCheckedForCheckbox(JSON.stringify(["Red", "Blue"]), predefined)).toBe(false);
  });

  test("returns false for empty array", () => {
    expect(isOtherCheckedForCheckbox("[]", predefined)).toBe(false);
  });

  test("returns false for empty string", () => {
    expect(isOtherCheckedForCheckbox("", predefined)).toBe(false);
  });

  test("returns false for invalid JSON", () => {
    expect(isOtherCheckedForCheckbox("not-json", predefined)).toBe(false);
  });
});

// ─── toggleOtherInCheckbox ──────────────────────────────────────────

describe("toggleOtherInCheckbox", () => {
  const predefined = new Set(["Red", "Blue"]);

  test("adds other text when toggling on", () => {
    const result = toggleOtherInCheckbox(JSON.stringify(["Red"]), predefined, "Custom", false);
    expect(JSON.parse(result)).toEqual(["Red", "Custom"]);
  });

  test("removes non-predefined values when toggling off", () => {
    const result = toggleOtherInCheckbox(JSON.stringify(["Red", "Custom"]), predefined, "Custom", true);
    expect(JSON.parse(result)).toEqual(["Red"]);
  });

  test("handles empty answer when toggling on", () => {
    const result = toggleOtherInCheckbox("", predefined, "My answer", false);
    expect(JSON.parse(result)).toEqual(["My answer"]);
  });

  test("handles invalid JSON gracefully", () => {
    const result = toggleOtherInCheckbox("bad-json", predefined, "Custom", false);
    expect(JSON.parse(result)).toEqual(["Custom"]);
  });
});

// ─── updateOtherTextInCheckbox ──────────────────────────────────────

describe("updateOtherTextInCheckbox", () => {
  const predefined = new Set(["Red", "Blue"]);

  test("replaces old other value with new text", () => {
    const result = updateOtherTextInCheckbox(JSON.stringify(["Red", "OldCustom"]), predefined, "NewCustom");
    expect(JSON.parse(result)).toEqual(["Red", "NewCustom"]);
  });

  test("preserves predefined values", () => {
    const result = updateOtherTextInCheckbox(JSON.stringify(["Red", "Blue", "Other"]), predefined, "Updated");
    expect(JSON.parse(result)).toEqual(["Red", "Blue", "Updated"]);
  });

  test("handles empty answer", () => {
    const result = updateOtherTextInCheckbox("", predefined, "Custom");
    expect(JSON.parse(result)).toEqual(["Custom"]);
  });

  test("handles invalid JSON gracefully", () => {
    const result = updateOtherTextInCheckbox("bad-json", predefined, "Custom");
    expect(JSON.parse(result)).toEqual(["Custom"]);
  });
});

// ─── removeSectionWithQuestions ──────────────────────────────────────

describe("removeSectionWithQuestions", () => {
  function makeSectionOrdered(id: string, order: number, questionIds: string[]) {
    return {
      id,
      title: `Section ${id}`,
      description: "",
      order,
      routingConfig: {},
      questions: questionIds.map((qId, i) => makeQuestion(qId, i)),
    };
  }

  test("returns null when only one section exists", () => {
    const sections = [makeSectionOrdered("s1", 0, ["q1", "q2"])];
    expect(removeSectionWithQuestions(sections, 0)).toBeNull();
  });

  test("returns null for out-of-bounds index", () => {
    const sections = [makeSectionOrdered("s1", 0, []), makeSectionOrdered("s2", 1, [])];
    expect(removeSectionWithQuestions(sections, -1)).toBeNull();
    expect(removeSectionWithQuestions(sections, 5)).toBeNull();
  });

  test("merges questions into previous section when removing middle section", () => {
    const sections = [
      makeSectionOrdered("s1", 0, ["q1"]),
      makeSectionOrdered("s2", 1, ["q2", "q3"]),
      makeSectionOrdered("s3", 2, ["q4"]),
    ];
    const result = removeSectionWithQuestions(sections, 1)!;
    expect(result).toHaveLength(2);
    // s1 should now contain q1, q2, q3
    expect(result[0].questions.map((q) => q.id)).toEqual(["q1", "q2", "q3"]);
    expect(result[0].questions.map((q) => q.order)).toEqual([0, 1, 2]);
    // s3 is now at index 1
    expect(result[1].id).toBe("s3");
    expect(result[1].order).toBe(1);
  });

  test("merges questions into next section when removing first section", () => {
    const sections = [
      makeSectionOrdered("s1", 0, ["q1", "q2"]),
      makeSectionOrdered("s2", 1, ["q3"]),
    ];
    const result = removeSectionWithQuestions(sections, 0)!;
    expect(result).toHaveLength(1);
    // s2 gets q1, q2 prepended? No — they are appended: [...target, ...removed]
    expect(result[0].questions.map((q) => q.id)).toEqual(["q3", "q1", "q2"]);
    expect(result[0].questions.map((q) => q.order)).toEqual([0, 1, 2]);
    expect(result[0].order).toBe(0);
  });

  test("merges questions into previous section when removing last section", () => {
    const sections = [
      makeSectionOrdered("s1", 0, ["q1"]),
      makeSectionOrdered("s2", 1, ["q2", "q3"]),
    ];
    const result = removeSectionWithQuestions(sections, 1)!;
    expect(result).toHaveLength(1);
    expect(result[0].questions.map((q) => q.id)).toEqual(["q1", "q2", "q3"]);
    expect(result[0].questions.map((q) => q.order)).toEqual([0, 1, 2]);
  });

  test("handles removing a section with no questions", () => {
    const sections = [
      makeSectionOrdered("s1", 0, ["q1"]),
      makeSectionOrdered("s2", 1, []),
    ];
    const result = removeSectionWithQuestions(sections, 1)!;
    expect(result).toHaveLength(1);
    expect(result[0].questions.map((q) => q.id)).toEqual(["q1"]);
  });

  test("does not mutate original sections (immutability)", () => {
    const sections = [
      makeSectionOrdered("s1", 0, ["q1"]),
      makeSectionOrdered("s2", 1, ["q2"]),
    ];
    const originalLen = sections[0].questions.length;
    removeSectionWithQuestions(sections, 1);
    expect(sections).toHaveLength(2);
    expect(sections[0].questions).toHaveLength(originalLen);
  });
});

// ─── FormHistory ────────────────────────────────────────────────────

describe("FormHistory", () => {
  test("starts empty with no undo/redo", () => {
    const h = new FormHistory<number>();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.length).toBe(0);
  });

  test("push adds snapshots", () => {
    const h = new FormHistory<number>();
    h.push(1);
    h.push(2);
    h.push(3);
    expect(h.length).toBe(3);
  });

  test("undo returns previous snapshot", () => {
    const h = new FormHistory<number>();
    h.push(10);
    h.push(20);
    h.push(30);
    expect(h.undo()).toBe(20);
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(true);
    expect(h.undo()).toBe(10);
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(true);
  });

  test("undo returns null when at the start", () => {
    const h = new FormHistory<number>();
    h.push(1);
    expect(h.undo()).toBeNull();
  });

  test("redo returns next snapshot", () => {
    const h = new FormHistory<number>();
    h.push(10);
    h.push(20);
    h.push(30);
    h.undo(); // -> 20
    h.undo(); // -> 10
    expect(h.redo()).toBe(20);
    expect(h.redo()).toBe(30);
    expect(h.canRedo).toBe(false);
  });

  test("redo returns null when at the end", () => {
    const h = new FormHistory<number>();
    h.push(1);
    h.push(2);
    expect(h.redo()).toBeNull();
  });

  test("push after undo discards redo future", () => {
    const h = new FormHistory<number>();
    h.push(1);
    h.push(2);
    h.push(3);
    h.undo(); // -> 2
    h.push(4); // discard 3
    expect(h.length).toBe(3); // [1, 2, 4]
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toBe(2);
  });

  test("respects maxSize cap", () => {
    const h = new FormHistory<number>(3);
    h.push(1);
    h.push(2);
    h.push(3);
    h.push(4); // evicts 1
    expect(h.length).toBe(3);
    // oldest remaining is 2
    h.undo(); // -> 3
    h.undo(); // -> 2
    expect(h.undo()).toBeNull(); // can't go before 2
  });

  test("push clones snapshot so later mutations don't corrupt history", () => {
    const h = new FormHistory<{ value: number }>();
    const obj = { value: 1 };
    h.push(obj);
    obj.value = 999; // mutate original after push
    h.push(obj);     // pushes clone of { value: 999 }
    const restored = h.undo()!;
    expect(restored.value).toBe(1); // first push was cloned independently
  });

  test("undo/redo return raw refs (no extra clone overhead)", () => {
    const h = new FormHistory<{ v: number }>();
    h.push({ v: 1 });
    h.push({ v: 2 });
    h.push({ v: 3 });
    const a = h.undo()!;        // index 1 → { v: 2 }
    expect(a.v).toBe(2);
    const b = h.redo()!;        // index 2 → { v: 3 }
    const c = h.undo()!;        // index 1 again → same ref as a
    expect(c).toBe(a);          // same reference — no clone on undo/redo
    expect(b).not.toBe(a);      // different stack entries are different refs
  });

  test("undo-redo-undo cycle is consistent", () => {
    const h = new FormHistory<string>();
    h.push("a");
    h.push("b");
    h.push("c");
    expect(h.undo()).toBe("b");
    expect(h.redo()).toBe("c");
    expect(h.undo()).toBe("b");
    expect(h.undo()).toBe("a");
    expect(h.redo()).toBe("b");
  });

  test("O(1) undo/redo — no re-allocation", () => {
    const h = new FormHistory<number>(1000);
    for (let i = 0; i < 1000; i++) h.push(i);
    const start = performance.now();
    for (let i = 0; i < 500; i++) h.undo();
    for (let i = 0; i < 500; i++) h.redo();
    const elapsed = performance.now() - start;
    // 1000 undo+redo ops should complete well under 50ms
    expect(elapsed).toBeLessThan(50);
  });
});
