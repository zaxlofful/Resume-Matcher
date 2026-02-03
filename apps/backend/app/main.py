"""FastAPI application entry point.

SECURITY WARNING:
This application is designed for LOCAL, SINGLE-USER deployments only.
It does NOT include authentication or authorization.

If deploying in a network-accessible environment:
1. Add authentication middleware (OAuth2, API keys, etc.)
2. Place behind a reverse proxy with TLS
3. Restrict CORS origins appropriately
4. Consider adding rate limiting

See SECURITY_ANALYSIS.md for detailed security recommendations.
"""

import asyncio
import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI

# Fix for Windows: Use ProactorEventLoop for subprocess support (Playwright)
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

logger = logging.getLogger(__name__)
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.config import settings
from app.database import db
from app.pdf import close_pdf_renderer, init_pdf_renderer
from app.routers import config_router, enrichment_router, health_router, jobs_router, resumes_router


# SEC-003: Log security warning on startup for non-localhost deployments
def _log_security_warning() -> None:
    """Log a security warning if the application is not bound to localhost."""
    # 0.0.0.0 binds to all interfaces, which is as risky as other non-localhost addresses
    localhost_addresses = ("127.0.0.1", "localhost", "::1")
    if settings.host not in localhost_addresses:
        logger.warning(
            "SECURITY WARNING: Application is bound to %s - this exposes all API "
            "endpoints without authentication. See SECURITY_ANALYSIS.md for recommendations.",
            settings.host,
        )
        if settings.host == "0.0.0.0":
            logger.warning(
                "SECURITY WARNING: Binding to 0.0.0.0 exposes the API on ALL network interfaces. "
                "Consider binding to 127.0.0.1 for local-only access or adding authentication."
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    _log_security_warning()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    # PDF renderer uses lazy initialization - will initialize on first use
    # await init_pdf_renderer()
    yield
    # Shutdown - wrap each cleanup in try-except to ensure all resources are released
    try:
        await close_pdf_renderer()
    except Exception as e:
        logger.error(f"Error closing PDF renderer: {e}")

    try:
        db.close()
    except Exception as e:
        logger.error(f"Error closing database: {e}")


app = FastAPI(
    title="Resume Matcher API",
    description="AI-powered resume tailoring for job descriptions",
    version=__version__,
    lifespan=lifespan,
)

# CORS middleware - origins configurable via CORS_ORIGINS env var
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health_router, prefix="/api/v1")
app.include_router(config_router, prefix="/api/v1")
app.include_router(resumes_router, prefix="/api/v1")
app.include_router(jobs_router, prefix="/api/v1")
app.include_router(enrichment_router, prefix="/api/v1")


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "Resume Matcher API",
        "version": __version__,
        "docs": "/docs",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
    )
