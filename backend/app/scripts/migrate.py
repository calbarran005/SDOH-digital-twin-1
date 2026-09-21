"""Seed roles/permissions/admin + migraciones ligeras (seguro de repetir)."""

from sqlalchemy import text

from app.core.database import Base, SessionLocal, engine  # noqa: F401
from app.core.security import hash_password  # noqa: F401
from app.main import init_default_data
from app.models import domain  # noqa: F401

#: DDL idempotente para bases de datos creadas antes de la restricción de unicidad
#: de equity_indexes (CRISP-DM Fase IV: la recomputación debe ser idempotente).
DDL_STEPS = [
    (
        "deduplicar equity_indexes",
        """
        DELETE FROM equity_indexes a
        USING equity_indexes b
        WHERE a.id < b.id
          AND a.tract_id = b.tract_id
          AND a.year = b.year
          AND a.index_type = b.index_type
        """,
    ),
    (
        "restricción uq_equity_tract_year_type",
        """
        DO $$
        BEGIN
            ALTER TABLE equity_indexes
                ADD CONSTRAINT uq_equity_tract_year_type
                UNIQUE (tract_id, year, index_type);
        EXCEPTION
            WHEN duplicate_table OR duplicate_object THEN NULL;
        END $$
        """,
    ),
]


def apply_ddl():
    for label, sql in DDL_STEPS:
        try:
            with engine.begin() as conn:
                conn.execute(text(sql))
            print(f"  ok: {label}")
        except Exception as exc:  # tabla inexistente en instalaciones nuevas
            print(f"  omitido ({label}): {exc.__class__.__name__}")


def migrate():
    init_default_data()
    print("Aplicando migraciones ligeras:")
    apply_ddl()


if __name__ == "__main__":
    migrate()
