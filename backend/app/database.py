from sqlalchemy import event, text
from sqlmodel import SQLModel, Session, create_engine

from .config import get_settings


def get_engine():
    settings = get_settings()
    engine = create_engine(
        settings.database_url,
        connect_args={"check_same_thread": False},  # MANDATORY for FastAPI + SQLite
    )

    # Set SQLite performance pragmas on every new connection
    @event.listens_for(engine, "connect")
    def set_sqlite_pragmas(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")      # concurrent reads during writes
        cursor.execute("PRAGMA synchronous=NORMAL")    # safe + faster than FULL
        cursor.execute("PRAGMA cache_size=-64000")     # 64 MB page cache
        cursor.execute("PRAGMA temp_store=MEMORY")     # temp tables in RAM
        cursor.execute("PRAGMA mmap_size=268435456")   # 256 MB memory-mapped I/O
        cursor.close()

    return engine


def create_db_and_tables(engine):
    SQLModel.metadata.create_all(engine)
    _create_indexes(engine)


def _create_indexes(engine) -> None:
    """Create performance indexes idempotently (IF NOT EXISTS).

    Called after create_all so the table is guaranteed to exist.
    Covers columns used in WHERE/ORDER BY that SQLModel doesn't auto-index.
    """
    indexes = [
        "CREATE INDEX IF NOT EXISTS ix_activity_sport_type ON activity (sport_type)",
        "CREATE INDEX IF NOT EXISTS ix_activity_start_date_local ON activity (start_date_local)",
        "CREATE INDEX IF NOT EXISTS ix_activity_has_heartrate ON activity (has_heartrate)",
        # Composite: most dashboard queries filter by epoch + sport_type together
        "CREATE INDEX IF NOT EXISTS ix_activity_epoch_sport ON activity (start_date_epoch, sport_type)",
    ]
    with engine.connect() as conn:
        for ddl in indexes:
            conn.execute(text(ddl))
        conn.commit()


def get_session(engine):
    with Session(engine) as session:
        yield session
