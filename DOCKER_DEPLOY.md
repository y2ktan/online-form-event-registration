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

Pick a release version first so you can push both an immutable tag and `latest`:

```bash
export VERSION=2026.04.26-1
```

```bash
# 1. Build the main application (must specify --target runner)
docker build . -t ghcr.io/y2ktan/ai-form-registration:$VERSION --target runner --platform linux/amd64

# 2. Build the database init image (handles migrations/seed)
docker build . -t ghcr.io/y2ktan/ai-form-registration:init-$VERSION --target init --platform linux/amd64

# 3. Tag them as latest aliases
docker tag ghcr.io/y2ktan/ai-form-registration:$VERSION ghcr.io/y2ktan/ai-form-registration:latest
docker tag ghcr.io/y2ktan/ai-form-registration:init-$VERSION ghcr.io/y2ktan/ai-form-registration:init

# 4. Verify the app image runs the server (not prisma)
docker inspect ghcr.io/y2ktan/ai-form-registration:latest --format='{{.Config.Cmd}}'
# Expected: [node server.js]

# 5. Push both immutable and latest tags to GHCR
docker push ghcr.io/y2ktan/ai-form-registration:$VERSION
docker push ghcr.io/y2ktan/ai-form-registration:init-$VERSION
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
  -t ghcr.io/y2ktan/ai-form-registration:$VERSION \
  -t ghcr.io/y2ktan/ai-form-registration:latest \
  --push

# Init image
docker buildx build . \
  --target init \
  --platform linux/amd64 \
  -t ghcr.io/y2ktan/ai-form-registration:init-$VERSION \
  -t ghcr.io/y2ktan/ai-form-registration:init \
  --push
```

### Pre-push validation

Run unit tests before publishing the image:

```bash
npm run test
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
  -e APP_URL="https://yourdomain.com" \
  -e GOOGLE_SHEETS_ENCRYPTION_KEY="your-encryption-key" \
  -e CRON_SECRET="your-cron-secret" \
  -e NEXT_PUBLIC_TURNSTILE_SITE_KEY="your-turnstile-site-key" \
  -e TURNSTILE_SECRET_KEY="your-turnstile-secret-key" \
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

From your local machine, build and publish a versioned release:

```bash
export VERSION=2026.04.26-1

docker buildx build . \
  --target runner \
  --platform linux/amd64 \
  -t ghcr.io/y2ktan/ai-form-registration:$VERSION \
  -t ghcr.io/y2ktan/ai-form-registration:latest \
  --push

docker buildx build . \
  --target init \
  --platform linux/amd64 \
  -t ghcr.io/y2ktan/ai-form-registration:init-$VERSION \
  -t ghcr.io/y2ktan/ai-form-registration:init \
  --push
```

Then on the VPS, sync the server to the new images:

```bash
# 1. Choose the release you want on the VPS
export VERSION=2026.04.26-1

# 2. Pull the exact images for that release
docker pull ghcr.io/y2ktan/ai-form-registration:$VERSION
docker pull ghcr.io/y2ktan/ai-form-registration:init-$VERSION

# 3. Refresh the rolling aliases too (optional but recommended)
docker pull ghcr.io/y2ktan/ai-form-registration:latest
docker pull ghcr.io/y2ktan/ai-form-registration:init

# 4. Stop and remove the old app container
docker stop ai-form-registration
docker rm ai-form-registration

# 5. Run database updates (migrations & seed) BEFORE starting the new app
# This connects to the same volume and updates the DB schema
docker run --rm \
  -e DATABASE_URL="file:/app/data/dev.db" \
  -e INITIAL_ADMIN_PASSWORD="your-admin-password" \
  -v ai-form-registration_db:/app/data \
  ghcr.io/y2ktan/ai-form-registration:init-$VERSION

# 6. Start the new app container from the versioned image
docker run -d \
  --name ai-form-registration \
  --restart unless-stopped \
  -p 3000:3000 \
  -e DATABASE_URL="file:/app/data/dev.db" \
  -e JWT_SECRET="your-jwt-secret" \
  -e INITIAL_ADMIN_PASSWORD="your-admin-password" \
  -e APP_URL="https://yourdomain.com" \
  -e GOOGLE_SHEETS_ENCRYPTION_KEY="your-encryption-key" \
  -e CRON_SECRET="your-cron-secret" \
  -e NEXT_PUBLIC_TURNSTILE_SITE_KEY="your-turnstile-site-key" \
  -e TURNSTILE_SECRET_KEY="your-turnstile-secret-key" \
  -v ai-form-registration_db:/app/data \
  -v ai-form-registration_uploads:/app/public/uploads \
  -v ai-form-registration_fonts:/app/public/fonts \
  ghcr.io/y2ktan/ai-form-registration:$VERSION

# 7. Verify the new container is healthy
docker ps
docker logs --tail=100 ai-form-registration
```

### Fast VPS sync commands

If you already have the env values and just want the shortest VPS update path, this is the core sequence:

```bash
export VERSION=2026.04.26-1
docker pull ghcr.io/y2ktan/ai-form-registration:$VERSION
docker pull ghcr.io/y2ktan/ai-form-registration:init-$VERSION
docker stop ai-form-registration && docker rm ai-form-registration
docker run --rm -e DATABASE_URL="file:/app/data/dev.db" -e INITIAL_ADMIN_PASSWORD="your-admin-password" -v ai-form-registration_db:/app/data ghcr.io/y2ktan/ai-form-registration:init-$VERSION
docker run -d --name ai-form-registration --restart unless-stopped -p 3000:3000 -e DATABASE_URL="file:/app/data/dev.db" -e JWT_SECRET="your-jwt-secret" -e INITIAL_ADMIN_PASSWORD="your-admin-password" -e APP_URL="https://yourdomain.com" -e GOOGLE_SHEETS_ENCRYPTION_KEY="your-encryption-key" -e CRON_SECRET="your-cron-secret" -e NEXT_PUBLIC_TURNSTILE_SITE_KEY="your-turnstile-site-key" -e TURNSTILE_SECRET_KEY="your-turnstile-secret-key" -v ai-form-registration_db:/app/data -v ai-form-registration_uploads:/app/public/uploads -v ai-form-registration_fonts:/app/public/fonts ghcr.io/y2ktan/ai-form-registration:$VERSION
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
* **Versioned Tags**: Deploy with an immutable tag like `2026.04.26-1`, then optionally also push `latest` as a convenience alias. The VPS should pull and run the versioned tag you intend to release.

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
