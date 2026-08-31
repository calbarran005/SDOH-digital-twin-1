"""Seed roles/permissions/admin (lightweight, safe to re-run)."""

from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models import domain  # noqa: F401
from app.main import init_default_data


def migrate():
    init_default_data()


if __name__ == "__main__":
    migrate()
