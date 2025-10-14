from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
import os

from app import create_app, db  # <-- import your factory + db

# This is the Alembic Config object, which provides access to values within alembic.ini
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    ini_path = os.path.join(os.path.dirname(__file__), "..", "alembic.ini")
    if os.path.exists(ini_path):
        fileConfig(ini_path)

# Get the Flask app (use your factory)
app = create_app(os.getenv("FLASK_CONFIG") or "default")

# Push context only once
with app.app_context():
    target_metadata = db.metadata

def run_migrations_offline():
    """Run migrations in 'offline' mode."""
    url = app.config["SQLALCHEMY_DATABASE_URI"]
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online():
    """Run migrations in 'online' mode."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        url=app.config["SQLALCHEMY_DATABASE_URI"],
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
