# Professional Docker Deployment Guide

This guide provides the professional standard for deploying the AI Form Registration app to a VPS using **Docker Compose** with persistent storage.

## 1. Why Docker Compose?
For professional production deployments, Docker Compose is preferred over raw `docker run` because:
* **Persistence**: It automatically manages named volumes for your database and uploads.
* **Declarative**: All configuration (ports, env, volumes) is stored in one file.
* **Lifecycle**: Simple commands to update (`pull` + `up`) without manual container management.

## 2. Build and Publish
Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username.

### Authenticate with GHCR
```bash
echo "YOUR_GITHUB_PAT" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

### Build and Push (App & Init)
We build a lean **runner** image for the app and a separate **init** image for database schema updates.

```bash
# Build for linux/amd64 (standard for most VPS)
docker build . -t ghcr.io/y2ktan/ai-form-registration:latest --platform linux/amd64
docker build . -t ghcr.io/y2ktan/ai-form-registration:init --target init --platform linux/amd64

# Push to Registry
docker push ghcr.io/y2ktan/ai-form-registration:latest
docker push ghcr.io/y2ktan/ai-form-registration:init
```

## 3. VPS Deployment (Professional Workflow)

### Step 1: Prepare Environment
On your VPS, create a directory for the app and a `.env` file:

```bash
mkdir -p ~/app && cd ~/app
nano .env
```

Add your production secrets to `.env`:
```env
DATABASE_URL="file:/app/data/dev.db"
JWT_SECRET="generate-a-long-random-string"
INITIAL_ADMIN_PASSWORD="secure-admin-password"
NEXTAUTH_URL="https://yourdomain.com"
# Turnstile Keys (if used)
NEXT_PUBLIC_TURNSTILE_SITE_KEY="your-key"
TURNSTILE_SECRET_KEY="your-secret"
```

### Step 2: Create docker-compose.yml
Docker Compose will automatically create the persistent volumes (`db_data` and `upload_data`) if they don't exist. **You do NOT need to run `docker volume create` manually.**

```yaml
# docker-compose.yml
services:
  app:
    image: ghcr.io/y2ktan/ai-form-registration:latest
    container_name: ai-form-registration
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file: .env
    volumes:
      - db_data:/app/data
      - upload_data:/app/public/uploads

  # Initialization service (run manually when needed)
  init:
    image: ghcr.io/y2ktan/ai-form-registration:init
    env_file: .env
    volumes:
      - db_data:/app/data
    profiles:
      - maintenance  # Prevents auto-start with 'docker compose up'

volumes:
  db_data:      # Keeps dev.db persistent
  upload_data:  # Keeps captured photos persistent
```

### Step 3: Launch and Initialize
```bash
# 1. Start the application
docker compose up -d

# 2. Initialize the database (Run migrations and seed)
# This uses the 'init' image to update the shared db_data volume
docker compose run --rm init
```


## 4. Maintenance & Updates

### How to release a new version?
When you push a new image to GHCR, updating your VPS is simple:
```bash
docker compose pull
docker compose up -d
# If there are DB schema changes, run the init container again (Step 3.2)
```

### Checking Persistence
Your data is stored in Docker-managed volumes. Even if you delete the container or update the image, your database and photos stay safe.
* **Logs**: `docker compose logs -f`
* **Volume Info**: `docker volume ls`

## 5. Security & Permissions
The `Dockerfile` is optimized to run as a non-root user (`nextjs` UID 1001). The `/app/data` and `/app/public/uploads` directories are pre-configured with correct ownership. Docker named volumes will inherit these permissions, ensuring the app can always write to the database and save new photos.
