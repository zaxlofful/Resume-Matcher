# Docker Deployment & Configuration Guide

This document describes the Docker deployment process and runtime configuration features for Resume Matcher.

## Table of Contents

1. [Quick Start](#quick-start)
2. [GitHub Container Registry](#github-container-registry)
3. [Runtime Configuration](#runtime-configuration)
4. [Building Images](#building-images)
5. [Environment Variables](#environment-variables)
6. [Troubleshooting](#troubleshooting)

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
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs

---

## GitHub Container Registry

Resume Matcher images are automatically built and published to GitHub Container Registry via GitHub Actions.

### Available Images

Images are published at: `ghcr.io/zaxlofful/resume-matcher`

**Available Tags:**
- `latest` - Latest build from the main branch
- `v*.*.*` - Specific version releases (e.g., `v1.0.0`)
- `main-{sha}` - Builds from specific commits on main branch

### Using Pre-built Images

#### Option 1: Direct Docker Run

```bash
# Pull the latest image
docker pull ghcr.io/zaxlofful/resume-matcher:latest

# Run the container
docker run -d \
  -p 3000:3000 \
  -p 8000:8000 \
  -v resume-data:/app/backend/data \
  -e LLM_PROVIDER=openai \
  -e LLM_API_KEY=your-api-key \
  ghcr.io/zaxlofful/resume-matcher:latest
```

#### Option 2: Docker Compose with Pre-built Image

Modify your `docker-compose.yml`:

```yaml
services:
  resume-matcher:
    image: ghcr.io/zaxlofful/resume-matcher:latest
    # Comment out or remove the 'build:' section
    container_name: resume-matcher
    ports:
      - "3000:3000"
      - "8000:8000"
    # ... rest of your configuration
```

### Multi-Platform Support

All images are built for multiple platforms:
- `linux/amd64` - Intel/AMD processors
- `linux/arm64` - ARM processors (Apple Silicon, Raspberry Pi, etc.)

Docker will automatically pull the correct image for your platform.

---

## Runtime Configuration

Resume Matcher now supports runtime configuration for the API URL - **no rebuild required** when changing ports or backend URLs!

### How It Works

1. The frontend uses a runtime configuration file (`/config.js`) that is generated at container startup
2. Configuration is controlled via environment variables
3. Changes take effect immediately when the container restarts - no image rebuild needed

### Customizing API URL

#### Default Configuration (Recommended)

By default, the frontend uses the `/api_be` proxy path which leverages Next.js rewrites:

```bash
# Default behavior - uses proxy path
docker-compose up -d
```

This configuration:
- Avoids CORS issues (same-origin requests)
- Works with any port mapping
- No additional configuration needed

#### Custom Backend URL

To point the frontend to a different backend:

```bash
# Use a custom backend URL
RUNTIME_API_URL=http://api.example.com:8080 docker-compose up -d
```

Or in your `.env` file:

```env
RUNTIME_API_URL=http://custom-backend:9000
```

#### Changing Ports

Ports can now be changed without rebuilding:

```bash
# Run on custom ports
FRONTEND_PORT=4000 BACKEND_PORT=9000 docker-compose up -d
```

The frontend will automatically use the correct API URL via the proxy path.

---

## Building Images

### Local Build

```bash
# Build the image locally
docker-compose build

# Or with custom build args
docker build \
  --build-arg NEXT_PUBLIC_API_URL=/api_be \
  -t resume-matcher:local \
  .
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

### Runtime Variables (No Rebuild Needed)

These variables can be changed by restarting the container:

| Variable | Default | Description |
|----------|---------|-------------|
| `FRONTEND_PORT` | `3000` | Host port for the frontend |
| `BACKEND_PORT` | `8000` | Host port for the backend API |
| `RUNTIME_API_URL` | `/api_be` | Frontend API URL (supports runtime change) |
| `LLM_PROVIDER` | — | AI provider (openai, anthropic, etc.) |
| `LLM_MODEL` | — | AI model to use |
| `LLM_API_KEY` | — | API key for LLM provider |
| `LLM_API_BASE` | — | Custom API endpoint URL |

### Build-Time Variables (Rebuild Required)

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `/api_be` | Fallback API URL baked into JS bundle |

### Example Configuration

Create a `.env` file in the project root:

```env
# Ports
FRONTEND_PORT=3000
BACKEND_PORT=8000

# API Configuration (runtime configurable!)
RUNTIME_API_URL=/api_be

# LLM Configuration
LLM_PROVIDER=openai
LLM_MODEL=gpt-4
LLM_API_KEY=sk-your-api-key-here

# For Ollama on host machine
# LLM_API_BASE=http://host.docker.internal:11434
```

Then start with:

```bash
docker-compose up -d
```

---

## Troubleshooting

### Issue: Frontend can't connect to backend

**Solution 1: Check the logs**
```bash
docker-compose logs -f
```

**Solution 2: Verify environment variables**
```bash
docker-compose config
```

**Solution 3: Use the default proxy path**
```bash
# Set/reset to default proxy path
RUNTIME_API_URL=/api_be docker-compose up -d
```

### Issue: Need to use a different backend port

**Old Way (Required Rebuild):**
```bash
# DON'T DO THIS anymore
BACKEND_PORT=9000 docker-compose build
BACKEND_PORT=9000 docker-compose up -d
```

**New Way (No Rebuild):**
```bash
# Just restart with new port - API URL updates automatically
BACKEND_PORT=9000 docker-compose up -d
```

### Issue: CORS errors when using custom API URL

If using a custom `RUNTIME_API_URL` with a different origin:

1. Ensure the backend CORS settings allow your frontend origin
2. Consider using the default `/api_be` proxy path instead
3. If you must use a different origin, update backend CORS configuration

### Issue: Changes to runtime config not taking effect

```bash
# Stop and remove containers
docker-compose down

# Start fresh
docker-compose up -d

# Or restart the service
docker-compose restart resume-matcher
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

### Health Checks

The Docker container includes health checks that monitor the backend API:

```bash
# Check container health
docker ps

# View health check logs
docker inspect resume-matcher | jq '.[0].State.Health'
```

---

## Contributing

For information about contributing to Resume Matcher, see [CONTRIBUTING.md](CONTRIBUTING.md).

For questions or support, join our [Discord server](https://dsc.gg/resume-matcher).
