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

### Optional: One-step Build + Push (recommended for VPS)

Use `buildx` to publish directly to GHCR (especially useful when building on macOS for Linux VPS):

```bash
# App image
docker buildx build . \
  --target runner \
  --platform linux/amd64 \
  -t ghcr.io/y2ktan/ai-form-registration:latest \
  --push

# Init image
docker buildx build . \
  --target init \
  --platform linux/amd64 \
  -t ghcr.io/y2ktan/ai-form-registration:init \
  --push
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
  -v ai-form-registration_fonts:/app/public/fonts \
  ghcr.io/y2ktan/ai-form-registration:latest

# 3. Run database migrations & seed (one-off, auto-removed after)
docker run --rm \
  -e DATABASE_URL="file:/app/data/dev.db" \
  -e INITIAL_ADMIN_PASSWORD="your-admin-password" \
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
  -v ai-form-registration_fonts:/app/public/fonts \
  ghcr.io/y2ktan/ai-form-registration:latest

# 4. If there are DB schema changes, run the init container
docker run --rm \
  -e DATABASE_URL="file:/app/data/dev.db" \
  -e INITIAL_ADMIN_PASSWORD="your-admin-password" \
  -v ai-form-registration_db:/app/data \
  ghcr.io/y2ktan/ai-form-registration:init
```

---

## 4. Key Concepts

* **Standalone Build**: `output: 'standalone'` in `next.config.mjs` produces a lean production image. The app container does not include the Prisma CLI — use the `init` image for DB operations.
* **Persistent Volumes**: Three named volumes keep data safe across updates:
  - `ai-form-registration_db` → SQLite database (`/app/data`)
  - `ai-form-registration_uploads` → uploaded photos/files (`/app/public/uploads`)
  - `ai-form-registration_fonts` → custom fonts (`/app/public/fonts`)
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
| 413 Request Entity Too Large | Nginx/reverse proxy body size limit (default 1MB) | Add `client_max_body_size 10m;` to your Nginx config (see below) |

### Fix: 413 Request Entity Too Large

The 413 error means your reverse proxy (Nginx) is blocking the request because it's too large. **Do not overwrite your entire config file with just one line.** 

A valid Nginx configuration must have a `server` block. Here is a complete example for `/etc/nginx/sites-available/vword.net`:

```nginx
server {
    listen 80;
    server_name vword.net;

    # Increase upload limit (must be inside server or location block)
    client_max_body_size 10m;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

**Steps to fix:**
1. Edit the file: `sudo nano /etc/nginx/sites-available/vword.net`
2. Replace the content with the full block above (adjust `server_name` and `proxy_pass` port if needed).
3. Test config: `sudo nginx -t`
4. Reload Nginx: `sudo systemctl reload nginx`

**Logs**: `docker logs ai-form-registration`
**Volume Info**: `docker volume ls`

---

## 6. Security & Permissions

The `Dockerfile` runs as a non-root user (`nextjs` UID 1001). The `/app/data` and `/app/public/uploads` directories are pre-configured with correct ownership. Docker named volumes inherit these permissions.
