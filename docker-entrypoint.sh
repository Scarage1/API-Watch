#!/bin/bash
set -e

echo "=== API-Watch Container Starting ==="
echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Python: $(python --version)"
echo "Working dir: $(pwd)"

# ── Run database migrations ─────────────────────────────────
if [ -n "$DATABASE_URL" ] && [ -d "alembic" ]; then
    # Only run Alembic for PostgreSQL (production DB with persistent state)
    echo "Running database migrations (PostgreSQL)..."
    python -m alembic upgrade head 2>&1 || {
        echo "⚠ Migrations failed — attempting table creation fallback..."
        python -c "
import asyncio
from src.database import init_db
asyncio.run(init_db())
print('Tables created via init_db()')
" 2>&1 || echo "⚠ Table creation also failed — app may still work if DB is already set up"
    }
    echo "Migrations complete."
else
    echo "No DATABASE_URL set — using SQLite. Tables will be created by app lifespan."
fi

# ── Create writable directories ──────────────────────────────
mkdir -p /app/data /app/logs 2>/dev/null || true

# ── Start gunicorn ───────────────────────────────────────────
PORT=${PORT:-8000}
WORKERS=${GUNICORN_WORKERS:-2}
TIMEOUT=${GUNICORN_TIMEOUT:-120}

echo "Starting gunicorn on port $PORT with $WORKERS workers..."

exec gunicorn src.api_server:app \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind "0.0.0.0:$PORT" \
    --workers "$WORKERS" \
    --timeout "$TIMEOUT" \
    --preload \
    --access-logfile - \
    --error-logfile - \
    --log-level info
