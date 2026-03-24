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

### Setup on VPS
Create a directory for the app and a `docker-compose.yml` file:

```yaml
# docker-compose.yml
services:
  app:
    image: ghcr.io/y2ktan/ai-form-registration:latest
    container_name: ai-form-registration
    ports:
      - "2277:2277"
    environment:
      - DATABASE_URL=file:/app/prisma/dev.db
      - JWT_SECRET=your_super_secret_jwt_key
      - NEXT_PUBLIC_TURNSTILE_SITE_KEY=your_site_key
      - TURNSTILE_SECRET_KEY=your_secret_key
      - INITIAL_ADMIN_PASSWORD=admin123
      - NEXTAUTH_URL=http://your-vps-ip:2277
    volumes:
      - ./data:/app/prisma
    restart: always
```

### Launch the App
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
