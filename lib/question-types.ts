export const QUESTION_TYPES = {
  SHORT_TEXT: "SHORT_TEXT",
  PARAGRAPH: "PARAGRAPH",
  MULTIPLE_CHOICE: "MULTIPLE_CHOICE",
  CHECKBOX: "CHECKBOX",
  DROPDOWN: "DROPDOWN",
  FILE_UPLOAD: "FILE_UPLOAD",
  LINEAR_SCALE: "LINEAR_SCALE",
  RATING: "RATING",
  MULTIPLE_CHOICE_GRID: "MULTIPLE_CHOICE_GRID",
  CHECKBOX_GRID: "CHECKBOX_GRID",
  DATE: "DATE",
  TIME: "TIME",
  SELFIE: "SELFIE",
} as const;

export type QuestionType = (typeof QUESTION_TYPES)[keyof typeof QUESTION_TYPES];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  SHORT_TEXT: "Short Answer",
  PARAGRAPH: "Paragraph",
  MULTIPLE_CHOICE: "Multiple Choice",
  CHECKBOX: "Checkboxes",
  DROPDOWN: "Dropdown",
  FILE_UPLOAD: "File Upload",
  LINEAR_SCALE: "Linear Scale",
  RATING: "Rating",
  MULTIPLE_CHOICE_GRID: "Multiple Choice Grid",
  CHECKBOX_GRID: "Checkbox Grid",
  DATE: "Date",
  TIME: "Time",
  SELFIE: "Selfie",
};

export const QUESTION_TYPE_CATEGORIES = {
  Text: [QUESTION_TYPES.SHORT_TEXT, QUESTION_TYPES.PARAGRAPH],
  Selection: [
    QUESTION_TYPES.MULTIPLE_CHOICE,
    QUESTION_TYPES.CHECKBOX,
    QUESTION_TYPES.DROPDOWN,
  ],
  Advanced: [
    QUESTION_TYPES.FILE_UPLOAD,
    QUESTION_TYPES.SELFIE,
    QUESTION_TYPES.LINEAR_SCALE,
    QUESTION_TYPES.RATING,
  ],
  Grids: [QUESTION_TYPES.MULTIPLE_CHOICE_GRID, QUESTION_TYPES.CHECKBOX_GRID],
  "Date/Time": [QUESTION_TYPES.DATE, QUESTION_TYPES.TIME],
};

export function requiresOptions(type: QuestionType): boolean {
  return (
    [QUESTION_TYPES.MULTIPLE_CHOICE, QUESTION_TYPES.CHECKBOX, QUESTION_TYPES.DROPDOWN] as string[]
  ).includes(type);
}

export function isGridType(type: QuestionType): boolean {
  return (
    [QUESTION_TYPES.MULTIPLE_CHOICE_GRID, QUESTION_TYPES.CHECKBOX_GRID] as string[]
  ).includes(type);
}
