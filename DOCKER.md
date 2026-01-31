# Docker Deployment & Configuration Guide

This document describes the Docker deployment process with Traefik integration for Resume Matcher.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture Overview](#architecture-overview)
3. [GitHub Container Registry](#github-container-registry)
4. [Traefik Integration](#traefik-integration)
5. [Building Images](#building-images)
6. [Environment Variables](#environment-variables)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Using Docker Compose (Recommended)

```bash
# Clone the repository
git clone https://github.com/srbhr/Resume-Matcher.git
cd Resume-Matcher

# Start the application
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the application
docker-compose down
```

The application will be available at:
- **Frontend**: http://localhost (via Traefik on port 80)
- **Traefik Dashboard**: http://localhost:8080

---

## Architecture Overview

Resume Matcher uses a modern architecture with the following components:

### Communication Architecture

- **Backend**: Runs on Unix socket (`/tmp/backend.sock`) for internal communication
- **Frontend**: Runs on port 3000 internally, accessed via Traefik
- **Traefik**: Reverse proxy handling external traffic on ports 80/443

### Benefits

- **Security**: Backend not exposed to network, reduced attack surface
- **Performance**: Unix sockets are faster than TCP/IP for local communication
- **Simplicity**: No runtime configuration generation or validation needed
- **Professional**: Traefik is industry standard for container routing
- **Scalability**: Easy to add SSL/TLS, load balancing, and multiple instances

---

## GitHub Container Registry

Resume Matcher images are automatically built and published to GitHub Container Registry via GitHub Actions.

> **Note for Forks**: Images are published to the repository owner's container registry. If you're using this from a fork, replace `zaxlofful` with your GitHub username in the image paths below, or use the original images from the main repository.

### Available Images

Images are published at: `ghcr.io/zaxlofful/resume-matcher`

**Available Tags:**
- `latest` - Latest build from the main branch
- `main` - Image built from the current main branch
- `v*.*.*` - Specific version releases (e.g., `v1.0.0`, `v1.0`, `v1`)

### Using Pre-built Images

#### Option 1: Docker Compose with Pre-built Image

Modify your `docker-compose.yml`:

```yaml
services:
  traefik:
    # ... traefik configuration ...
  
  resume-matcher:
    image: ghcr.io/zaxlofful/resume-matcher:latest
    # Comment out or remove the 'build:' section
    container_name: resume-matcher
    # ... rest of your configuration
```

#### Option 2: Direct Docker Run (Not Recommended)

When running without docker-compose, you need to manually set up networking:

```bash
# Create a network for Traefik
docker network create traefik

# Run Traefik
docker run -d \
  --name traefik \
  --network traefik \
  -p 80:80 -p 443:443 -p 8080:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  traefik:v3.0 \
  --api.insecure=true \
  --providers.docker=true \
  --providers.docker.exposedbydefault=false \
  --entrypoints.web.address=:80

# Run Resume Matcher
docker run -d \
  --name resume-matcher \
  --network traefik \
  -v resume-data:/app/backend/data \
  -e LLM_PROVIDER=openai \
  -e LLM_API_KEY=your-api-key \
  --label "traefik.enable=true" \
  --label "traefik.http.routers.resume-matcher.rule=Host(\`localhost\`)" \
  --label "traefik.http.routers.resume-matcher.entrypoints=web" \
  --label "traefik.http.services.resume-matcher.loadbalancer.server.port=3000" \
  ghcr.io/zaxlofful/resume-matcher:latest
```

### Multi-Platform Support

All images are built for multiple platforms:
- `linux/amd64` - Intel/AMD processors
- `linux/arm64` - ARM processors (Apple Silicon, Raspberry Pi, etc.)

Docker will automatically pull the correct image for your platform.

---

## Traefik Integration

Traefik serves as the reverse proxy and edge router for Resume Matcher, providing:

- Automatic service discovery via Docker labels
- SSL/TLS termination (when configured)
- Load balancing capabilities
- Professional routing and middleware support

### Default Configuration

The default `docker-compose.yml` includes:

```yaml
traefik:
  image: traefik:v3.0
  command:
    - "--api.insecure=true"
    - "--providers.docker=true"
    - "--providers.docker.exposedbydefault=false"
    - "--entrypoints.web.address=:80"
    - "--entrypoints.websecure.address=:443"
  ports:
    - "80:80"      # HTTP
    - "443:443"    # HTTPS
    - "8080:8080"  # Dashboard
```

### Custom Domain Configuration

To use a custom domain, set the `DOMAIN` environment variable:

```bash
# In .env file
DOMAIN=resume.example.com

# Or inline
DOMAIN=resume.example.com docker-compose up -d
```

Then configure your DNS to point to your server's IP address.

### SSL/TLS Configuration

To enable SSL/TLS with Let's Encrypt:

1. Modify `docker-compose.yml` to add certificate resolver:

```yaml
traefik:
  command:
    - "--api.insecure=true"
    - "--providers.docker=true"
    - "--providers.docker.exposedbydefault=false"
    - "--entrypoints.web.address=:80"
    - "--entrypoints.websecure.address=:443"
    - "--certificatesresolvers.myresolver.acme.tlschallenge=true"
    - "--certificatesresolvers.myresolver.acme.email=your-email@example.com"
    - "--certificatesresolvers.myresolver.acme.storage=/letsencrypt/acme.json"
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock:ro
    - ./letsencrypt:/letsencrypt
```

2. Update resume-matcher labels:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.resume-matcher.rule=Host(`resume.example.com`)"
  - "traefik.http.routers.resume-matcher.entrypoints=websecure"
  - "traefik.http.routers.resume-matcher.tls.certresolver=myresolver"
```

### Traefik Dashboard

The Traefik dashboard is available at http://localhost:8080 and provides:

- Real-time service status
- Active routers and middleware
- Health check status
- Request metrics

---

## Building Images

### Local Build

```bash
# Build the image locally
docker-compose build

# Or with Docker directly
docker build -t resume-matcher:local .
```

### GitHub Actions Workflow

Images are automatically built when:
- Code is pushed to the `main` branch
- A new tag matching `v*.*.*` is created
- A pull request is opened/updated (build only, no push)

The workflow can also be manually triggered via GitHub Actions UI.

**Workflow Features:**
- Multi-platform builds (amd64, arm64)
- Build caching for faster builds
- Automatic tagging based on git refs
- Publishes to GitHub Container Registry

---

## Environment Variables

### LLM Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | — | AI provider (openai, anthropic, gemini, deepseek, ollama, openrouter) |
| `LLM_MODEL` | — | AI model to use |
| `LLM_API_KEY` | — | API key for LLM provider |
| `LLM_API_BASE` | — | Custom API endpoint URL |

### Traefik Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DOMAIN` | `localhost` | Domain name for the application |

### Example Configuration

Create a `.env` file in the project root:

```env
# LLM Configuration
LLM_PROVIDER=openai
LLM_MODEL=gpt-4
LLM_API_KEY=sk-your-api-key-here

# Custom domain (optional)
DOMAIN=localhost

# For Ollama on host machine
# LLM_API_BASE=http://host.docker.internal:11434
```

Then start with:

```bash
docker-compose up -d
```

---

## Troubleshooting

### Issue: Cannot access the application

**Solution 1: Check Traefik status**
```bash
# Check if Traefik is running
docker ps | grep traefik

# View Traefik logs
docker logs traefik

# Check Traefik dashboard
curl http://localhost:8080/api/http/routers
```

**Solution 2: Verify resume-matcher is healthy**
```bash
# Check container status
docker ps

# View resume-matcher logs
docker-compose logs -f resume-matcher

# Check health status
docker inspect resume-matcher | jq '.[0].State.Health'
```

**Solution 3: Verify network connectivity**
```bash
# Check if services are on the same network
docker network inspect resume-matcher_default
```

### Issue: Frontend can't connect to backend

This should not occur with Unix socket architecture, but if you see errors:

**Solution 1: Check Unix socket**
```bash
# Exec into container
docker exec -it resume-matcher sh

# Check if socket exists
ls -la /tmp/backend.sock

# Test socket connectivity
curl --unix-socket /tmp/backend.sock http://localhost/api/v1/health
```

**Solution 2: Check backend logs**
```bash
docker-compose logs -f resume-matcher | grep backend
```

### Issue: Traefik dashboard not accessible

**Solution:**
```bash
# Ensure port 8080 is not already in use
lsof -i :8080

# Check Traefik configuration
docker-compose config | grep -A 10 traefik
```

### Issue: SSL/TLS certificate errors

**Solution 1: Check certificate resolver**
```bash
# View certificate storage
docker exec traefik cat /letsencrypt/acme.json
```

**Solution 2: Verify domain DNS**
```bash
# Check DNS resolution
nslookup resume.example.com

# Verify domain is accessible
curl -I http://resume.example.com
```

### Issue: Health checks failing

**Solution:**
```bash
# Check backend is running
docker exec resume-matcher ps aux | grep uvicorn

# Test health endpoint directly
docker exec resume-matcher curl --unix-socket /tmp/backend.sock http://localhost/api/v1/health

# Check for socket permissions
docker exec resume-matcher ls -la /tmp/backend.sock
```

### Issue: Changes not taking effect

```bash
# Stop and remove containers
docker-compose down

# Remove volumes if needed (WARNING: deletes data)
docker-compose down -v

# Rebuild and start fresh
docker-compose build
docker-compose up -d
```

---

## Advanced Usage

### Using with Ollama (Local AI)

```bash
# Start Ollama on your host machine (http://localhost:11434)
# Then configure Resume Matcher to use it:

LLM_PROVIDER=ollama \
LLM_API_BASE=http://host.docker.internal:11434 \
LLM_MODEL=llama3.2 \
docker-compose up -d
```

### Persistent Data

Resume Matcher stores data in a Docker volume:

```bash
# View volume data
docker volume inspect resume-matcher_resume-data

# Backup volume data
docker run --rm \
  -v resume-matcher_resume-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/resume-data-backup.tar.gz /data

# Restore volume data
docker run --rm \
  -v resume-matcher_resume-data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/resume-data-backup.tar.gz -C /
```

### Multiple Instances with Load Balancing

To run multiple Resume Matcher instances:

```yaml
services:
  traefik:
    # ... traefik configuration ...

  resume-matcher:
    # ... configuration ...
    deploy:
      replicas: 3
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.resume-matcher.rule=Host(`localhost`)"
      - "traefik.http.services.resume-matcher.loadbalancer.server.port=3000"
```

### Monitoring and Metrics

Enable Prometheus metrics in Traefik:

```yaml
traefik:
  command:
    # ... existing commands ...
    - "--metrics.prometheus=true"
    - "--metrics.prometheus.entrypoint=metrics"
  ports:
    - "8082:8082"  # Metrics port
```

---

## Contributing

For information about contributing to Resume Matcher, see [CONTRIBUTING.md](CONTRIBUTING.md).

For questions or support, join our [Discord server](https://dsc.gg/resume-matcher).
