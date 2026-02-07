#!/bin/bash
# Azure App Service startup script
# Azure sets PORT env var automatically (default 8000)
set -e

# Ensure we're in the deployment directory
cd /home/site/wwwroot

# Run database migrations (safe to run repeatedly — no-ops if up to date)
if [ -d "alembic" ]; then
  echo "Running database migrations..."
  python -m alembic upgrade head || echo "⚠️  Migrations skipped (non-fatal)"
fi

# Start with gunicorn + uvicorn workers for production performance
# Azure sets PORT; default to 8000 if unset
export PORT=${PORT:-8000}
echo "Starting API-Watch on port $PORT..."

exec gunicorn src.api_server:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind "0.0.0.0:$PORT" \
  --workers 2 \
  --timeout 120 \
  --access-logfile - \
  --error-logfile -
