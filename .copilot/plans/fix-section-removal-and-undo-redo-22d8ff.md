# Plan: Fix Section Removal and Implement Undo/Redo

This plan outlines the steps to prevent question loss when removing sections and to add a history-based Undo/Redo feature to the form builder.

## 1. Fix Section Removal Logic
- Modify `removeSection` in `app/admin/forms/[id]/page.tsx`.
- Instead of just filtering out the section, move its `questions` to the preceding section (or the following one if it's the first section).
- Ensure question orders are updated correctly after merging.

## 2. Implement Undo/Redo Functionality
- Introduce a history state management system in `app/admin/forms/[id]/page.tsx`.
- Track `FormData` snapshots in a `history` array with a `pointer`.
- Implement `undo` and `redo` functions that navigate this history.
- Add "Undo" and "Redo" buttons to the top header UI using Lucide icons (`Undo2`, `Redo2`).
- Ensure that history pushes are throttled or triggered by meaningful actions to avoid cluttering history with every keystroke.

## 3. UI Updates
- Update the header in `app/admin/forms/[id]/page.tsx` to include the Undo/Redo buttons near the save status.
- Add keyboard shortcuts (Cmd+Z / Cmd+Shift+Z) for better usability.

## 4. Verification
- Test removing a section with questions and verify they move to the correct section.
- Test Undo/Redo for various actions: adding/removing questions, moving sections, editing text.
- Verify that Undo/Redo works correctly with the auto-save mechanism.
