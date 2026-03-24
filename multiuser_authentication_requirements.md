Secure Multi-User Management & Identity System
Role: Senior Full-Stack Engineer & Security Specialist
Context: Upgrade the current Form Builder Admin to support Multi-User Management and secure Self-Service Profile actions (Change Password).

---

## Implementation Status: COMPLETED

---

## 1. UI/UX: Global Identity Header ✅

**Top-Right Profile Menu**: Replaced static "Logout" with a Profile Icon/Avatar dropdown.

**Dropdown Menu** contents:
- **User Info**: Displays Nickname/Email and role badge (ADMIN/USER).
- **Change Password**: Opens modal with secure password change flow.
- **Manage Users**: Navigates to `/admin/users` (visible only to ADMIN role).
- **SMTP Settings**: Navigates to `/admin/settings/smtp` (visible only to ADMIN role).
- **Logout**: Standard session termination.

**Files**: `app/admin/page.tsx`

## 2. Feature: Secure Change Password ✅

**Fields**: Current Password, New Password, Confirm New Password.

**Security Controls Implemented**:
- **Unmask Toggle**: Eye icon on all password fields to toggle visibility.
- **Anti-Bypass**: `onPaste` disabled on "Confirm New Password" field.
- **Rate Limiting**: 5 failed attempts = 15-minute lockout per user, plus IP-based rate limiting.
- **Password Policy**: Minimum 12 characters, uppercase, numbers, and symbols enforced server-side (`lib/password-validation.ts`).

**API**: `POST /api/auth/change-password`
**Files**: `app/admin/page.tsx` (modal), `app/api/auth/change-password/route.ts`, `lib/password-validation.ts`

## 3. Feature: User Management Dashboard (Admin Only) ✅

**User List Table**: Displays Nickname, Email, Role, Status (Pending/Active), and Form count.

**Admin Actions**:
- **Delete User**: Removes user and all associated data (cascading). Self-deletion prevented.
- **Resend Invite**: RefreshCw icon to resend activation email.
- **Invite User**: Modal with Email, Nickname (optional), Role selection.

**Invitation Flow**:
- System creates user with `PENDING_ACTIVATION` status and placeholder password hash.
- Generates secure 32-byte hex token in `VerificationToken` table (24h expiry, one-time use).
- Sends email via configured SMTP with activation URL (`/auth/set-password?token=...`).
- If SMTP not configured, user is created but admin is notified to share link manually.

**Pages**: `/admin/users`, `/auth/set-password`
**API**: `GET/POST /api/admin/users`, `DELETE /api/admin/users/[id]`, `POST /api/admin/users/[id]/resend`
**Files**: `app/admin/users/page.tsx`, `app/auth/set-password/page.tsx`, `app/api/auth/activate/route.ts`

## 4. Feature: Form-Specific Permissions (Collaborators) ✅

**Model**: `FormCollaborator` (many-to-many between User and Form) with unique constraint on `[userId, formId]`.

**Behavior**:
- **Only ADMIN can create forms** — "New Form" button hidden for USER role.
- **ADMIN can invite users to specific forms** via the "Collaborators" tab in the form editor.
- **Invited users (EDITOR role)** can edit that specific form and view its responses.
- **Same user can be invited to multiple forms**.
- **Admins have access to all forms** regardless of collaborator status.
- **Dashboard shows all accessible forms** — owned (admin) or collaborated (user).

**Pages**: Collaborators tab in `/admin/forms/[id]`
**API**: `GET/POST /api/forms/[id]/collaborators`, `DELETE /api/forms/[id]/collaborators/[userId]`

## 5. Feature: SMTP Configuration (Admin Only) ✅

**Admin page** at `/admin/settings/smtp` to configure:
- SMTP Host, Port, SSL/TLS toggle
- Username, Password (masked in UI)
- From Email, From Name

**Storage**: `SmtpConfig` Prisma model (single active configuration).
**Password is masked** when fetched via API — only updated if a real value is provided.

**API**: `GET/POST /api/admin/smtp`
**Files**: `app/admin/settings/smtp/page.tsx`, `lib/mail.ts`

## 6. Security & Authorization Architecture ✅

**Middleware** (`middleware.ts`):
- Both ADMIN and USER roles can access `/admin`.
- `/admin/settings/*` and `/admin/users/*` restricted to ADMIN only.
- Unauthenticated users redirected to `/login`.
- Logged-in users redirected from `/login` to `/admin`.

**Server-Side Validation**: All API routes validate session role. Form edit routes check `canEditForm()` which verifies admin status or collaborator membership.

**Password Policy**: 12+ characters, uppercase, numbers, symbols — enforced in `lib/password-validation.ts`.

**Secure Tokens**: `VerificationToken` table with `used` flag and `expiresAt`. Tokens invalidated after use.

**Rate Limiting**: Applied to all API endpoints via `lib/rate-limit.ts`. Strict rate limiting on auth-sensitive routes (login, change-password, activate).

**Audit Logging**: `AuditLog` table records: LOGIN_SUCCESS, LOGIN_FAILED, PASSWORD_CHANGED, ACCOUNT_ACTIVATED, USER_INVITED, USER_DELETED, COLLABORATOR_ADDED, COLLABORATOR_REMOVED, SMTP_CONFIG_UPDATED, INVITATION_RESENT — with userId, IP address, user agent, and JSON details.

**PENDING_ACTIVATION block**: Users with `PENDING_ACTIVATION` status cannot log in until they set their password.

## 7. Database Schema Changes

New fields on `User`: `nickname`, `phone`, `status` (PENDING_ACTIVATION | ACTIVATED).

New models:
- **FormCollaborator**: userId, formId, role (EDITOR), unique on [userId, formId]
- **VerificationToken**: email, token (unique), type (INVITATION | PASSWORD_RESET), expiresAt, used
- **AuditLog**: userId (optional), action, details (JSON), ipAddress, userAgent
- **SmtpConfig**: host, port, secure, user, pass, fromEmail, fromName

New relations: `User.collaborations`, `Form.collaborators`, `User.auditLogs`

## 8. Technical Stack

- **Auth**: jose (JWT), bcryptjs, crypto (token generation)
- **Email**: nodemailer (dynamic SMTP config from DB)
- **Icons**: Lucide-React
- **UI**: TailwindCSS, custom modals (no external modal library needed)
- **Validation**: Server-side with custom validators

## 9. Testing Plan

- **Test 1 (RBAC)**: Verify USER cannot create forms (`POST /api/forms` returns 401).
- **Test 2 (RBAC)**: Verify USER cannot access other users' forms (returns 404/403).
- **Test 3 (Collaboration)**: Verify invited user can edit the specific form they were invited to.
- **Test 4 (Security)**: Verify `onPaste` disabled on confirm password fields.
- **Test 5 (Flow)**: Verify activation token changes status from PENDING_ACTIVATION to ACTIVATED.
- **Test 6 (SMTP)**: Mock email delivery using configured SMTP settings.