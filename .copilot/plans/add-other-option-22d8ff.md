# Plan - Add "Other" Option to Multiple Choice and Checkbox Questions

Implement a custom field for "Other" in Multiple Choice and Checkbox questions, allowing respondents to provide their own answers.

## User Review Required

> [!IMPORTANT]
> - The "Other" option value will be stored as the actual text entered by the user (e.g., if they type "Banana", the answer is stored as "Banana").
> - If "Other" is selected but no text is entered, should it be considered valid if the question is "Required"? (Assuming it should require text if the question is required).

## Proposed Changes

### 1. Admin UI (Form Builder)
- **File**: `app/admin/forms/[id]/page.tsx`
- **Component**: `SortableQuestion`
- **Changes**:
    - Add an `add "Other"` button next to the `Add option` button for `MULTIPLE_CHOICE` and `CHECKBOX` question types.
    - If `hasOtherOption` is true in `question.config`, render an "Other..." option at the end of the options list.
    - Provide a way to remove the "Other" option (trash icon).
    - Update `updateQuestion` logic to handle toggling `hasOtherOption`.

### 2. Respondent UI (Form Page)
- **File**: `app/form/[id]/page.tsx`
- **Changes**:
    - Detect `hasOtherOption` in the question configuration.
    - For `MULTIPLE_CHOICE`: Add a radio button labeled "Other:" followed by a text input field.
    - For `CHECKBOX`: Add a checkbox labeled "Other:" followed by a text input field.
    - Update local state handling to capture the text input when "Other" is selected.
    - Ensure that if "Other" is selected, the text input value is used as the answer for that question.

### 3. Submission API
- **File**: `app/api/submit/route.ts`
- **Changes**:
    - Ensure server-side validation handles the "Other" values correctly.
    - Since we are storing the raw value, the API might not need major changes if the client sends the final value, but we should verify if there are any constraints on allowed options that would block a custom value.

### 4. Edit Response UI
- **File**: `app/edit/[id]/page.tsx`
- **Changes**:
    - Update the rendering logic to correctly show the "Other" text input if the stored value doesn't match any of the predefined options.

## Verification Plan

### Automated Tests
- Add a new test file `__tests__/other-option.test.ts` to test:
    - Routing logic with "Other" values (if applicable, though "Other" usually doesn't have specific routing rules in Google Forms).
    - Validation logic for "Other" field.
- Update `__tests__/api/forms.test.ts` if needed.

### Manual Verification
1. Open Form Builder.
2. Create a Multiple Choice question.
3. Click `add "Other"`.
4. Verify it appears in the list.
5. Save and open the Public Form.
6. Select "Other", type a custom value, and submit.
7. Verify the submission in the Admin Responses tab.
8. Repeat for Checkbox questions.
