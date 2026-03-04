from sqlmodel import SQLModel, Session, create_engine

from .config import get_settings


def get_engine():
    settings = get_settings()
    return create_engine(
        settings.database_url,
        connect_args={"check_same_thread": False},  # MANDATORY for FastAPI + SQLite
    )


def create_db_and_tables(engine):
    SQLModel.metadata.create_all(engine)


def get_session(engine):
    with Session(engine) as session:
        yield session
