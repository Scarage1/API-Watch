#!/bin/bash
# Azure App Service startup script
# Azure sets PORT env var automatically (default 8000)

echo "=== API-Watch Startup ==="
echo "PWD: $(pwd)"
echo "Date: $(date)"

# Ensure we're in the deployment directory
cd /home/site/wwwroot
echo "Working dir: $(pwd)"
echo "Contents: $(ls -la)"

# Activate Oryx-created virtual environment (created during zip deployment)
if [ -d "antenv" ]; then
  echo "Activating Oryx virtual environment (antenv)..."
  source antenv/bin/activate
  echo "Python: $(which python)"
  echo "Pip packages: $(pip list --format=columns 2>/dev/null | head -5)"
else
  echo "WARNING: antenv directory not found!"
  echo "Checking for packages directory..."
fi

# Add bundled packages to Python path (fallback if no antenv)
if [ -d "packages" ]; then
  export PYTHONPATH="/home/site/wwwroot/packages:$PYTHONPATH"
  echo "Using pre-bundled Python packages"
fi

# Fallback: install if neither antenv nor bundled packages have gunicorn
if ! python -c "import gunicorn" 2>/dev/null; then
  echo "gunicorn not found, installing dependencies..."
  pip install --no-cache-dir -r requirements.txt 2>&1 | tail -10 || echo "⚠️  pip install failed"
fi

# Verify critical imports work
echo "Testing critical imports..."
python -c "
import sys
print(f'Python: {sys.executable}')
try:
    import fastapi; print(f'fastapi: {fastapi.__version__}')
except Exception as e: print(f'fastapi FAILED: {e}')
try:
    import gunicorn; print(f'gunicorn: OK')
except Exception as e: print(f'gunicorn FAILED: {e}')
try:
    from src.api_server import app; print('src.api_server: OK')
except Exception as e: print(f'src.api_server FAILED: {e}')
" 2>&1 || echo "Import test failed"

# Run database migrations (safe to run repeatedly — no-ops if up to date)
if [ -d "alembic" ]; then
  echo "Running database migrations..."
  python -m alembic upgrade head 2>&1 || echo "⚠️  Migrations skipped (non-fatal)"
fi

# Start with gunicorn + uvicorn workers for production performance
export PORT=${PORT:-8000}
echo "Starting API-Watch on port $PORT..."

exec gunicorn src.api_server:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind "0.0.0.0:$PORT" \
  --workers 1 \
  --timeout 180 \
  --access-logfile - \
  --error-logfile -
