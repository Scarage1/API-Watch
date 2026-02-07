#!/bin/bash
# Azure App Service startup script
# Azure sets PORT env var automatically (default 8000)
set -e

# Ensure we're in the deployment directory
cd /home/site/wwwroot

# Activate Oryx-created virtual environment (created during zip deployment)
if [ -d "antenv" ]; then
  echo "Activating Oryx virtual environment (antenv)..."
  source antenv/bin/activate
fi

# Add bundled packages to Python path (fallback if no antenv)
if [ -d "packages" ]; then
  export PYTHONPATH="/home/site/wwwroot/packages:$PYTHONPATH"
  echo "Using pre-bundled Python packages"
fi

# Fallback: install if neither antenv nor bundled packages have gunicorn
if ! python -c "import gunicorn" 2>/dev/null; then
  echo "Installing Python dependencies (timeout 180s)..."
  timeout 180 pip install --no-cache-dir -r requirements.txt 2>&1 | tail -5 || echo "⚠️  pip install timed out or failed (non-fatal)"
fi

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
  --workers 1 \
  --timeout 180 \
  --access-logfile - \
  --error-logfile -
