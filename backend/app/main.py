import logging
import logging.handlers
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .database import create_db_and_tables, get_engine
from .routers import activity_detail, auth, coach, dashboard, gear, health, health_import, insights, sync, trophies

logger = logging.getLogger(__name__)

# Resolve paths relative to the project root (parent of backend/)
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_PROJECT_ROOT = _BACKEND_DIR.parent
_FRONTEND_DIST = _PROJECT_ROOT / "frontend" / "dist"


def configure_logging() -> None:
    """Set up console + optional rotating file logging."""
    log_format = "%(asctime)s %(levelname)s %(name)s: %(message)s"
    formatter = logging.Formatter(log_format)

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # Attempt file handler — gracefully skip if directory isn't writable
    try:
        settings = get_settings()
        db_path = settings.database_url.replace("sqlite:///", "")
        data_dir = Path(db_path).parent
        logs_dir = data_dir / "logs"
        logs_dir.mkdir(parents=True, exist_ok=True)

        file_handler = logging.handlers.RotatingFileHandler(
            logs_dir / "stravviz.log",
            maxBytes=5 * 1024 * 1024,  # 5 MB
            backupCount=3,
        )
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)
    except Exception as exc:
        root_logger.warning("File logging unavailable: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    configure_logging()

    # Ensure data directory exists based on database_url
    settings = get_settings()
    db_path = settings.database_url.replace("sqlite:///", "")
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    # Create engine and store on app state
    engine = get_engine()
    app.state.engine = engine

    # Initialize database tables
    create_db_and_tables(engine)

    logger.info("StravaViz backend started")

    # Bootstrap authentication
    try:
        from .services.strava_auth import bootstrap_auth

        await bootstrap_auth(engine, settings)
    except Exception as exc:
        logger.error(
            "Auth bootstrap failed: %s — visit /auth/login to authenticate manually",
            exc,
        )

    yield

    # Shutdown
    engine.dispose()
    logger.info("StravaViz backend stopped")


app = FastAPI(
    title="StravaViz",
    description="Strava data visualization dashboard API",
    version="0.1.0",
    lifespan=lifespan,
)

# Only add CORS middleware in development (Vite dev server needs it)
if os.getenv("ENVIRONMENT", "development") != "production":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Routers
app.include_router(auth.router)
app.include_router(health.router)
app.include_router(sync.router)
app.include_router(dashboard.router)
app.include_router(activity_detail.router)
app.include_router(gear.router)
app.include_router(trophies.router)
app.include_router(insights.router)
app.include_router(health_import.router)
app.include_router(coach.router)

# --- Static file serving for production ---
# Mount the frontend dist directory if the frontend has been built.
# StaticFiles handles path sanitization internally (no traversal risk).
# html=True serves index.html as the SPA fallback for unmatched routes.
if _FRONTEND_DIST.exists():
    app.mount(
        "/",
        StaticFiles(directory=str(_FRONTEND_DIST), html=True),
        name="spa",
    )
