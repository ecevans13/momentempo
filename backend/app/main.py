import logging
import logging.handlers
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import create_db_and_tables, get_engine
from .routers import activity_detail, auth, dashboard, gear, health, sync, trophies

logger = logging.getLogger(__name__)


def configure_logging() -> None:
    """Set up dual console + rotating file logging."""
    logs_dir = Path("backend/logs")
    logs_dir.mkdir(parents=True, exist_ok=True)

    log_format = "%(asctime)s %(levelname)s %(name)s: %(message)s"
    formatter = logging.Formatter(log_format)

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)

    file_handler = logging.handlers.RotatingFileHandler(
        logs_dir / "stravviz.log",
        maxBytes=5 * 1024 * 1024,  # 5 MB
        backupCount=3,
    )
    file_handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.addHandler(console_handler)
    root_logger.addHandler(file_handler)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    configure_logging()

    # Ensure required directories exist
    Path("backend/data").mkdir(parents=True, exist_ok=True)
    Path("backend/logs").mkdir(parents=True, exist_ok=True)

    # Create engine and store on app state
    engine = get_engine()
    app.state.engine = engine

    # Initialize database tables
    create_db_and_tables(engine)

    logger.info("StravaViz backend started")

    # Bootstrap authentication — opens browser on first run, refreshes silently on
    # subsequent runs, stays completely silent when a valid token exists.
    try:
        from .services.strava_auth import bootstrap_auth

        await bootstrap_auth(engine, get_settings())
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
