# Docker Deployment Guide

This guide covers building, publishing, and deploying the AI Form Registration app to a VPS.

> **Important:** The `Dockerfile` has two build targets. You **must** specify `--target runner` for the app image, otherwise Docker defaults to the last stage (`init`).

---

## 1. Authenticate with GHCR

```bash
echo "YOUR_GITHUB_PAT" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

---

## 2. Local Build & Push

We build two images: a lean **runner** image for the app and a separate **init** image for database migrations/seed.

```bash
# 1. Build the main application (must specify --target runner)
docker build . -t ghcr.io/y2ktan/ai-form-registration:latest --target runner --platform linux/amd64

# 2. Build the database init image (handles migrations/seed)
docker build . -t ghcr.io/y2ktan/ai-form-registration:init --target init --platform linux/amd64

# 3. Verify the app image runs the server (not prisma)
docker inspect ghcr.io/y2ktan/ai-form-registration:latest --format='{{.Config.Cmd}}'
# Expected: [node server.js]

# 4. Push both to GHCR
docker push ghcr.io/y2ktan/ai-form-registration:latest
docker push ghcr.io/y2ktan/ai-form-registration:init
```

---

## 3. VPS Deployment

### First-time Setup

```bash
# 1. Pull images
docker pull ghcr.io/y2ktan/ai-form-registration:latest
docker pull ghcr.io/y2ktan/ai-form-registration:init

# 2. Run the app (volumes are auto-created if they don't exist)
docker run -d \
  --name ai-form-registration \
  --restart unless-stopped \
  -p 3000:3000 \
  -e DATABASE_URL="file:/app/data/dev.db" \
  -e JWT_SECRET="your-jwt-secret" \
  -e INITIAL_ADMIN_PASSWORD="your-admin-password" \
  -e NEXTAUTH_URL="https://yourdomain.com" \
  -v ai-form-registration_db:/app/data \
  -v ai-form-registration_uploads:/app/public/uploads \
  ghcr.io/y2ktan/ai-form-registration:latest

# 3. Run database migrations & seed (one-off, auto-removed after)
docker run --rm \
  -e DATABASE_URL="file:/app/data/dev.db" \
  -v ai-form-registration_db:/app/data \
  ghcr.io/y2ktan/ai-form-registration:init
```

### Releasing a New Version

```bash
# 1. Pull latest images
docker pull ghcr.io/y2ktan/ai-form-registration:latest
docker pull ghcr.io/y2ktan/ai-form-registration:init

# 2. Stop and remove old container
docker stop ai-form-registration
docker rm ai-form-registration

# 3. Run the new app
docker run -d \
  --name ai-form-registration \
  --restart unless-stopped \
  -p 3000:3000 \
  -e DATABASE_URL="file:/app/data/dev.db" \
  -e JWT_SECRET="your-jwt-secret" \
  -e INITIAL_ADMIN_PASSWORD="your-admin-password" \
  -e NEXTAUTH_URL="https://yourdomain.com" \
  -v ai-form-registration_db:/app/data \
  -v ai-form-registration_uploads:/app/public/uploads \
  ghcr.io/y2ktan/ai-form-registration:latest

# 4. If there are DB schema changes, run the init container
docker run --rm \
  -e DATABASE_URL="file:/app/data/dev.db" \
  -v ai-form-registration_db:/app/data \
  ghcr.io/y2ktan/ai-form-registration:init
```

---

## 4. Key Concepts

* **Standalone Build**: `output: 'standalone'` in `next.config.mjs` produces a lean production image. The app container does not include the Prisma CLI — use the `init` image for DB operations.
* **Persistent Volumes**: Two named volumes keep data safe across updates:
  - `ai-form-registration_db` → SQLite database (`/app/data`)
  - `ai-form-registration_uploads` → uploaded photos/files (`/app/public/uploads`)
* **No `docker volume create` needed**: Docker auto-creates named volumes on first `docker run -v`.
* **The `init` Image**: A one-off container (`--rm`) that runs `prisma db push` and `prisma db seed`, then exits. Use it whenever DB schema changes.

---

## 5. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| 502 Bad Gateway | Wrong image (init instead of runner) | Rebuild with `--target runner`, verify with `docker inspect` |
| Prisma seed loop in logs | Container running init image with `--restart` | Stop, remove, re-run with `latest` (runner) image |
| Uploads lost after update | Missing upload volume | Add `-v ai-form-registration_uploads:/app/public/uploads` |
| DB not updated after deploy | Schema changes not applied | Run the `init` container (step 4 in release) |

**Logs**: `docker logs ai-form-registration`
**Volume Info**: `docker volume ls`

---

## 6. Security & Permissions

The `Dockerfile` runs as a non-root user (`nextjs` UID 1001). The `/app/data` and `/app/public/uploads` directories are pre-configured with correct ownership. Docker named volumes inherit these permissions.
