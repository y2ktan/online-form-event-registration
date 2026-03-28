/**
 * Pure helper functions for form builder operations:
 * - Cross-section drag-and-drop logic
 * - Per-option routing config management
 *
 * Extracted from the form builder page for testability.
 */

import type { RoutingConfig, OptionMatchRouting } from "./routing";

export interface QuestionConfig {
  routing?: RoutingConfig;
  [key: string]: unknown;
}

// ─── DnD helpers ────────────────────────────────────────────────────

type HasIdAndOrder = { id: string; order: number };
type HasIdAndQuestions<Q extends HasIdAndOrder> = { id: string; questions: Q[] };

/** Find which section contains a question by ID. O(S*Q) but S,Q are small. */
export function findSectionForQuestion<Q extends HasIdAndOrder, S extends HasIdAndQuestions<Q>>(
  sections: S[],
  questionId: string
): { sIdx: number; qIdx: number } | null {
  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const qIdx = sections[sIdx].questions.findIndex((q) => q.id === questionId);
    if (qIdx !== -1) return { sIdx, qIdx };
  }
  return null;
}

/**
 * Move a question between sections. Returns new sections array (immutable).
 * Returns null if the move is invalid (same section, missing IDs).
 */
export function moveQuestionBetweenSections<Q extends HasIdAndOrder, S extends HasIdAndQuestions<Q>>(
  sections: S[],
  activeId: string,
  overId: string
): S[] | null {
  const activePos = findSectionForQuestion(sections, activeId);
  if (!activePos) return null;

  let overSIdx = -1;
  let overQIdx = -1;
  const overPos = findSectionForQuestion(sections, overId);
  if (overPos) {
    overSIdx = overPos.sIdx;
    overQIdx = overPos.qIdx;
  } else {
    const secIdx = sections.findIndex((s) => s.id === overId);
    if (secIdx !== -1) {
      overSIdx = secIdx;
      overQIdx = sections[secIdx].questions.length;
    }
  }

  if (overSIdx === -1 || activePos.sIdx === overSIdx) return null;

  const newSections = sections.map((s) => ({ ...s, questions: [...s.questions] }));
  const [moved] = newSections[activePos.sIdx].questions.splice(activePos.qIdx, 1);
  newSections[overSIdx].questions.splice(overQIdx, 0, moved);
  newSections[activePos.sIdx].questions.forEach((q, i) => { q.order = i; });
  newSections[overSIdx].questions.forEach((q, i) => { q.order = i; });
  return newSections as S[];
}

/**
 * Reorder a question within the same section. Returns new sections array (immutable).
 * Returns null if active and over are in different sections or not found.
 */
export function reorderQuestionWithinSection<Q extends HasIdAndOrder, S extends HasIdAndQuestions<Q>>(
  sections: S[],
  activeId: string,
  overId: string
): S[] | null {
  const activePos = findSectionForQuestion(sections, activeId);
  const overPos = findSectionForQuestion(sections, overId);
  if (!activePos || !overPos || activePos.sIdx !== overPos.sIdx) return null;

  const newSections = sections.map((s) => ({ ...s, questions: [...s.questions] }));
  const questions = newSections[activePos.sIdx].questions;
  const [moved] = questions.splice(activePos.qIdx, 1);
  questions.splice(overPos.qIdx, 0, moved);
  questions.forEach((q, i) => { q.order = i; });
  return newSections as S[];
}

// ─── Routing config helpers ─────────────────────────────────────────

/**
 * Update routing rules when an option value is renamed.
 * Returns new config object (immutable). Returns original config if no change needed.
 */
export function updateRoutingOnOptionRename(
  config: QuestionConfig,
  oldValue: string,
  newValue: string
): QuestionConfig {
  if (!config.routing?.enabled || config.routing.type !== "OPTION_MATCH") return config;
  const routing = config.routing as OptionMatchRouting;
  if (!(oldValue in routing.rules)) return config;

  const newRules = { ...routing.rules };
  newRules[newValue] = newRules[oldValue];
  delete newRules[oldValue];
  return { ...config, routing: { ...routing, rules: newRules } };
}

/**
 * Clean up routing rules when an option is deleted.
 * Returns new config object (immutable). Returns original config if no change needed.
 */
export function removeRoutingForOption(
  config: QuestionConfig,
  optionValue: string
): QuestionConfig {
  if (!config.routing?.enabled || config.routing.type !== "OPTION_MATCH") return config;
  const routing = config.routing as OptionMatchRouting;
  if (!(optionValue in routing.rules)) return config;

  const newRules = { ...routing.rules };
  delete newRules[optionValue];
  return { ...config, routing: { ...routing, rules: newRules } };
}

// ─── Section removal helper ─────────────────────────────────────────

/**
 * Remove a section and merge its questions into an adjacent section.
 * Questions move to the previous section (or next if removing the first).
 * Returns new sections array (immutable). Returns null if only one section.
 *
 * Time:  O(S + Q_target) — one pass to shallow-copy sections, one to re-index merged questions.
 * Space: O(S + Q_target) — new array of sections + new merged question array.
 */
export function removeSectionWithQuestions<
  Q extends HasIdAndOrder,
  S extends HasIdAndQuestions<Q> & { order: number }
>(sections: S[], sectionIndex: number): S[] | null {
  if (sections.length <= 1 || sectionIndex < 0 || sectionIndex >= sections.length) return null;

  const targetIdx = sectionIndex > 0 ? sectionIndex - 1 : 1;
  const merged = [...sections[targetIdx].questions, ...sections[sectionIndex].questions];
  for (let i = 0; i < merged.length; i++) merged[i] = { ...merged[i], order: i };

  const result: S[] = [];
  for (let i = 0; i < sections.length; i++) {
    if (i === sectionIndex) continue;
    result.push({
      ...sections[i],
      order: result.length,
      ...(i === targetIdx ? { questions: merged } : {}),
    } as S);
  }
  return result;
}

// ─── Undo / Redo history (pure, framework-agnostic) ─────────────────

/**
 * Manages an immutable history stack for undo/redo.
 *
 * push()  — O(1) amortised. Clones on push only; truncates via length assignment.
 * undo()  — O(1) pointer decrement, returns raw reference (caller must not mutate).
 * redo()  — O(1) pointer increment, returns raw reference.
 * Space   — O(maxSize * snapshot_size).
 */
export class FormHistory<T> {
  private stack: T[] = [];
  private index = -1;
  private readonly maxSize: number;

  constructor(maxSize = 50) {
    this.maxSize = maxSize;
  }

  /** Push a new snapshot, discarding any redo-future. */
  push(snapshot: T): void {
    this.stack.length = this.index + 1;            // O(1) truncate
    this.stack.push(structuredClone(snapshot));     // clone once
    if (this.stack.length > this.maxSize) this.stack.shift();
    this.index = this.stack.length - 1;
  }

  /** Return the previous snapshot or null. */
  undo(): T | null {
    if (this.index <= 0) return null;
    return this.stack[--this.index];
  }

  /** Return the next snapshot or null. */
  redo(): T | null {
    if (this.index >= this.stack.length - 1) return null;
    return this.stack[++this.index];
  }

  get canUndo(): boolean { return this.index > 0; }
  get canRedo(): boolean { return this.index < this.stack.length - 1; }
  get length(): number { return this.stack.length; }
}

// ─── "Other" option helpers ─────────────────────────────────────────

/**
 * For MULTIPLE_CHOICE: check if the current answer is a custom "Other" value
 * (i.e. the answer doesn't match any predefined option).
 */
export function isOtherSelectedForRadio(
  answer: string | undefined,
  predefinedValues: Set<string>
): boolean {
  return answer !== undefined && !predefinedValues.has(answer);
}

/**
 * For CHECKBOX: check if any value in the JSON array is a custom "Other" value.
 */
export function isOtherCheckedForCheckbox(
  answerJson: string,
  predefinedValues: Set<string>
): boolean {
  try {
    const vals: string[] = JSON.parse(answerJson || "[]");
    return vals.some((v) => !predefinedValues.has(v));
  } catch {
    return false;
  }
}

/**
 * For CHECKBOX: update the JSON answer array to toggle the "Other" value.
 * If toggling on, appends otherText. If toggling off, removes non-predefined values.
 * Returns the new JSON string.
 */
export function toggleOtherInCheckbox(
  answerJson: string,
  predefinedValues: Set<string>,
  otherTextValue: string,
  currentlyChecked: boolean
): string {
  let vals: string[];
  try { vals = JSON.parse(answerJson || "[]"); } catch { vals = []; }
  if (currentlyChecked) {
    vals = vals.filter((v) => predefinedValues.has(v));
  } else {
    vals.push(otherTextValue);
  }
  return JSON.stringify(vals);
}

/**
 * For CHECKBOX: replace the "Other" text value in the JSON answer array.
 * Removes any non-predefined value and appends the new text.
 * Returns the new JSON string.
 */
export function updateOtherTextInCheckbox(
  answerJson: string,
  predefinedValues: Set<string>,
  newText: string
): string {
  let vals: string[];
  try { vals = JSON.parse(answerJson || "[]"); } catch { vals = []; }
  vals = vals.filter((v) => predefinedValues.has(v));
  vals.push(newText);
  return JSON.stringify(vals);
}
