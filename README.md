# AI Form Registration

An admin-controlled form builder built with Next.js, Prisma, SQLite, and Tailwind CSS.

## 🚀 Quick Start (Docker)

The fastest way to deploy is using Docker. See [DOCKER_DEPLOY.md](./DOCKER_DEPLOY.md) for full instructions.

```bash
docker build . -t ghcr.io/y2ktan/ai-form-registration:latest
docker run -p 3000:3000 ghcr.io/y2ktan/ai-form-registration:latest
```

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Database:** SQLite via Prisma ORM
- **Styling:** Tailwind CSS
- **Auth:** JWT with HTTP-only cookies
- **CAPTCHA:** Cloudflare Turnstile (optional)

## Getting Started (Clean Slate)

### 1. Clone and install dependencies

```bash
git clone <repo-url>
cd ai-form-registration
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and set your values:

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | SQLite database path | Yes (default: `file:./dev.db`) |
| `JWT_SECRET` | Secret key for session tokens | Yes |
| `INITIAL_ADMIN_PASSWORD` | Password for the seeded admin user | No (default: `admin123`) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key | No |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret key | No |

### 3. One-command setup

```bash
npm run setup
```

This installs dependencies, generates the Prisma client, syncs the database schema, and seeds the admin user.

### 4. Start the development server

```bash
npm run dev
```

The database is automatically synced on every `npm run dev` and `npm run build`, so you never need to manually run migrations.

Open [http://localhost:3000](http://localhost:3000) to view the app.

### 5. Log in

- **Email:** `admin@formbuilder.com`
- **Password:** value of `INITIAL_ADMIN_PASSWORD` (default: `admin123`)

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Sync database + start dev server |
| `npm run build` | Sync database + production build |
| `npm start` | Start production server |
| `npm run setup` | Full first-time setup (install, generate, push, seed) |
| `npm run db:push` | Sync Prisma schema to database |
| `npm run db:seed` | Seed the admin user |
| `npm run db:reset` | Delete database, recreate schema, and re-seed |
| `npm run clean` | Remove build cache and database |
| `npm run clean:full` | Full clean + reinstall + setup (for new releases) |
| `npm run lint` | Run ESLint |

## Clean Up for Production / New Release

To do a full clean reset (removes build artifacts, caches, database, and reinstalls everything):

```bash
npm run clean:full
```

For a lighter cleanup that only removes build cache and database:

```bash
npm run clean
npm run setup
```

## Project Structure

```
app/
  admin/              # Admin dashboard and form builder
  api/                # API routes (forms, responses, auth)
  form/[id]/          # Public form submission page
  edit/[id]/          # Respondent edit page
  login/              # Admin login page
lib/                  # Utilities (auth, prisma, rate-limit, sanitize)
prisma/
  schema.prisma       # Database schema
  seed.ts             # Admin user seeder
```
