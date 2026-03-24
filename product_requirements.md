# PRP: Admin-Controlled Form Builder (Google Forms Clone)

## 1. Project Overview
Build a full-stack Form Builder application that allows Admins to create, manage, and distribute dynamic forms. Users (respondents) can access these forms via a public URL to submit responses.

**Tech Stack Requirements:**
- **Framework:** Next.js (App Router preferred)
- **Database/ORM:** SQLite with Prisma
- **Authentication:** Custom Admin Login with hashed passwords
- **Testing:** Vitest for unit testing of API logic.

## 2. Core Functional Requirements
**Admin Dashboard & Form Builder**
- **Floating Toolbar:** A persistent UI element containing: Add Question (+), Import, Add Title (Tt), Add Image/Video, and Add Section.
- **Question Types to Support:**
  - **Text:** Short answer, Paragraph.
  - **Selection:** Multiple choice, Checkboxes, Dropdown.
  - **Advanced:** File upload (with size limits), Linear scale, Rating stars.
  - **Grids:** Multiple choice grid, Checkbox grid.
  - **Date/Time:** Specific picker components.
- **Form Management:** Toggle "Published" status, view response counts, and delete forms (with cascade delete for questions).
- **Field Configuration:** Admin can toggle whether each question is "Required" or "Optional".
- ~~**Default Fields:** A "Phone Number" field is automatically included and permanently required for every form created.~~
- **Form Identity Settings Block (New UX):** Instead of treating the Phone Number as a locked, draggable question, it is placed as a fixed "Identity Settings" block at the top of the form builder (just below Title/Description). It is permanently required but the Admin can customize the label (e.g., "WhatsApp Number") and helper text. On the public form, it is visually separated from the main questions.
- **Data Management:** Admin can search submitted responses using the respondent's phone number.
- **Response Editing:** Admin can modify submitted data and generate an editable link to send to respondents, allowing them to update their own submissions.
- **Auto-Save:** The form builder must auto-save changes after a short debounce (~1.5s of inactivity). No manual Save button. A subtle status indicator ("Saving…" / "Saved") should appear in the header.
- **Preview Mode:** A preview icon in the form editor toolbar allows the admin to temporarily view and try the form in a full-screen overlay without needing to publish it first.
- **Responses Tab in Form Editor:** The form editor page includes a tab bar ("Questions" | "Responses"). The Responses tab lists all submissions for that form. Admin can edit or delete any submitted entry inline.
- **Drag and Drop:** Admin can reorder questions inside the form builder by dragging and dropping them via a designated grip handle.
- **Responsive UI:** All form builder layouts and public form pages must be fully responsive, supporting screen sizes from mobile devices up to large desktop monitors with low time complexity (high performance) layouts.

**Respondent Interface**
- Publicly accessible page for specific Form IDs.
- Validation for "Required" fields.
- Success state upon submission.

## 3. Data Architecture (Prisma Schema)
The database must support the following relational structure:
- **User Model:** Includes email, passwordHash, and role (Enum: USER, ADMIN).
- **Form Model:** Includes title, description, published status, and authorId.
- **Question Model:** Includes type (Enum of all types above), label, isRequired, and order.
- **Option/Response Models:** Support for choices in selection questions and storage of submitted data.

## 4. Admin Access & Initialization
- **Predefined Admin:** Implement a `prisma/seed.ts` script that creates a default admin account:
  - **Email:** admin@formbuilder.com
  - **Default Password:** (Set as an environment variable `INITIAL_ADMIN_PASSWORD`).
- **Session Management:** Use HTTP-only cookies for JWT storage.

## 5. Security & Protection
- **Rate Limiting:** Apply rate limits to all API endpoints, specifically `/api/login` and `/api/submit`.
- **Bot Prevention:** Integrate CAPTCHA (Cloudflare Turnstile or reCAPTCHA v3) on the Login and Signup pages.
- **Secrets:** All API keys and Database URLs must reside in `.env`. No hardcoded secrets.
- **Sanitization:** All user inputs must be sanitized to prevent XSS.

## 6. AI Agent "Writing Rules" (System Instructions)
**CRITICAL:** The following rules must be followed for every code generation task.
- **Principle of Least Change:** Limit code changes to the minimum necessary when implementing a new feature or fixing an issue. Do not refactor stable files or change global configurations unless explicitly instructed.
- **Security First:** Do not generate code that exposes API keys in the client-side bundle. Ensure all server actions/routes check for the ADMIN role before performing write operations.
- **Component Isolation:** Build form inputs as modular components to ensure the builder is maintainable.
- **Type Safety:** Ensure every component and API route is fully typed using the generated Prisma types.

## 7. Definition of Done
- [ ] Admin can log in with predefined credentials.
- [ ] Admin can create a form with at least 3 different question types.
- [ ] The form is viewable on a public route.
- [ ] A user can submit the form and the data is saved to the database.
- [ ] Rate limiting is active on the submission endpoint.
- [ ] Form auto-saves on change without a manual Save button.
- [ ] Admin can reorder questions using drag-and-drop.
- [ ] Admin can preview a form without publishing it.
- [ ] Admin can view, edit, and delete responses from within the form editor page.
- [ ] CRUD logic is unit tested using Vitest and passes successfully.
