# Implement 'Make a Copy' for Forms

The plan is to implement a feature that allows administrators to duplicate an existing form, including all its sections, questions, options, and collaborators, while resetting it to a draft state.

## Proposed UI/UX
- **Action Button**: Add a 'Copy' icon (using Lucide's `Copy` icon) next to the existing Edit/Publish/Delete buttons on the form cards in the Admin Dashboard.
- **Feedback**: Show a brief loading state on the button while the copy is being processed.
- **Result**: Upon successful duplication, the user will be immediately redirected to the new form's builder page.
- **Naming**: The new form will be titled "Copy of [Original Title]".

## Technical Implementation

### 1. API Endpoint (`POST /api/forms/[id]/copy`)
- **Authorization**: Ensure only the author or a collaborator with appropriate permissions can copy the form (reuse `canEditForm`).
- **Deep Copy Logic**:
    - Fetch the original form with all nested relations: `sections`, `questions`, `options`, and `collaborators`.
    - Create a new `Form` record with `published: false` and the prefixed title.
    - **Section Mapping**: Create new sections and store a mapping of `oldSectionId -> newSectionId`.
    - **Question & Option Duplication**: 
        - Iterate through questions, linking them to the new form and the corresponding new section (using the mapping).
        - Duplicate all options for each question.
    - **Routing Configuration Update**:
        - Update `routingConfig` in `Section` to replace old section IDs with new ones.
        - Update `config` in `Question` (which contains routing rules) to replace old section IDs with new ones.
    - **Collaborator Copy**: Create new `FormCollaborator` records for the new form.
- **Transaction**: Run the entire operation inside a Prisma transaction to ensure atomicity.

### 2. Admin Dashboard Update (`app/admin/page.tsx`)
- Add `handleCopyForm` function to call the new endpoint.
- Add the `Copy` button to the `Form` card UI.
- Handle loading and error states for the copy operation.

### 3. Verification
- Test copying a form with multiple sections and complex routing rules.
- Verify that collaborators are correctly carried over.
- Ensure the new form is indeed a draft and has the correct title.
