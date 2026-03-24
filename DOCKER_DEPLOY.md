# Docker Deployment Guide for AI Form Registration

This guide provides instructions on how to build, publish, and deploy the AI Form Registration app using Docker and GitHub Container Registry (GHCR).

## 1. Prerequisites
- Docker installed on your local machine.
- A GitHub account and a Personal Access Token (PAT) with `write:packages` scope.
- A VPS with Docker and Docker Compose installed.

## 2. Build and Publish to GitHub Container Registry (GHCR)

Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username.

### Authenticate with GHCR
```bash
echo "YOUR_GITHUB_PAT" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

### Build for Production (multi-platform)
To ensure the image runs on most VPS architectures (usually linux/amd64), use the following command:

```bash
docker build . -t ghcr.io/y2ktan/ai-form-registration:latest --platform linux/amd64
```

### Push to GHCR
```bash
docker push ghcr.io/y2ktan/ai-form-registration:latest
```

## 3. Deploy to VPS

### Option A: Deployment via Docker Run (CLI)
This is the recommended way to quickly update and run the container.

```bash
# 1. Pull the latest image
docker pull ghcr.io/y2ktan/ai-form-registration:latest

# 2. Stop and remove existing container (if any)
docker stop ai-form-registration || true
docker rm ai-form-registration || true

# 3. Run the container
docker run -d \
  --name ai-form-registration \
  --restart unless-stopped \
  -p 3000:3000 \
  -e DATABASE_URL="file:/app/data/dev.db" \
  -e JWT_SECRET="your_super_secret_jwt_key" \
  -e NEXT_PUBLIC_TURNSTILE_SITE_KEY="your_site_key" \
  -e TURNSTILE_SECRET_KEY="your_secret_key" \
  -e INITIAL_ADMIN_PASSWORD="admin123" \
  -e NEXTAUTH_URL="https://vword.net" \
  -v ai-form-registration_db:/app/data \
  -v ai-form-registration_uploads:/app/public/uploads \
  ghcr.io/y2ktan/ai-form-registration:latest
```

### Option B: Deployment via Docker Compose
Create a directory for the app and a `docker-compose.yml` file:

```yaml
# docker-compose.yml
services:
  app:
    image: ghcr.io/y2ktan/ai-form-registration:latest
    container_name: ai-form-registration
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=file:/app/data/dev.db
      - JWT_SECRET=your_super_secret_jwt_key
      - NEXT_PUBLIC_TURNSTILE_SITE_KEY=your_site_key
      - TURNSTILE_SECRET_KEY=your_secret_key
      - INITIAL_ADMIN_PASSWORD=admin123
      - NEXTAUTH_URL=https://vword.net
    volumes:
      - ai-form-registration_db:/app/data
      - ai-form-registration_uploads:/app/public/uploads
    restart: always

volumes:
  ai-form-registration_db:
  ai-form-registration_uploads:
```

### Launch (if using Compose)
```bash
docker compose up -d
```

### Run Database Migrations/Seed
After the container is running, you may need to initialize the database:

```bash
docker exec -it ai-form-registration npx prisma db push
docker exec -it ai-form-registration npx prisma db seed
```

## 4. Troubleshooting
- **Logs**: View logs with `docker logs -f ai-form-registration`.
- **Permissions**: If the SQLite database fails to write, ensure the `./data` directory on your VPS has the correct permissions (the container runs as user `nextjs` with UID 1001).
