#!/bin/bash
# Azure App Service startup script
# Azure sets PORT env var automatically (default 8000)

# Redirect ALL output to both stdout and a log file for debugging
exec > >(tee -a /home/LogFiles/startup.log) 2>&1

echo "=== API-Watch Startup ==="
echo "PWD: $(pwd)"
echo "Date: $(date)"

# Ensure we're in the deployment directory
cd /home/site/wwwroot || { echo "FATAL: cannot cd to /home/site/wwwroot"; exit 1; }
echo "Working dir: $(pwd)"
echo "Contents:"
ls -la

# Activate Oryx-created virtual environment (created during zip deployment)
if [ -d "antenv" ]; then
  echo "Activating Oryx virtual environment (antenv)..."
  source antenv/bin/activate
  echo "Python: $(which python)"
  echo "Python version: $(python --version 2>&1)"
else
  echo "WARNING: antenv directory not found!"
  echo "Listing site directory:"
  ls -la /home/site/wwwroot/
fi

# Fallback: install if antenv doesn't have gunicorn
if ! python -c "import gunicorn" 2>/dev/null; then
  echo "gunicorn not found, installing dependencies..."
  pip install --no-cache-dir -r requirements.txt 2>&1 | tail -10 || echo "pip install failed"
fi

# Verify critical imports work
echo "=== Testing critical imports ==="
python -c "
import sys
print(f'Python: {sys.executable}')
print(f'sys.path: {sys.path[:5]}')
try:
    import fastapi; print(f'  fastapi: {fastapi.__version__}')
except Exception as e: print(f'  fastapi FAILED: {e}')
try:
    import gunicorn; print(f'  gunicorn: OK')
except Exception as e: print(f'  gunicorn FAILED: {e}')
try:
    import uvicorn; print(f'  uvicorn: OK')
except Exception as e: print(f'  uvicorn FAILED: {e}')
try:
    from src.config import get_settings
    s = get_settings()
    print(f'  src.config: OK (db={s.database_url[:30]}...)')
except Exception as e: print(f'  src.config FAILED: {e}')
try:
    from src.api_server import app; print(f'  src.api_server: OK')
except Exception as e:
    print(f'  src.api_server FAILED: {e}')
    import traceback; traceback.print_exc()
" 2>&1

echo "=== Import test complete ==="

# Run database migrations (safe to run repeatedly — no-ops if up to date)
if [ -d "alembic" ]; then
  echo "Running database migrations..."
  python -m alembic upgrade head 2>&1 || echo "Migrations skipped (non-fatal)"
fi

# Start with gunicorn + uvicorn workers for production performance
# --preload: load app before forking so import errors are visible in main process
export PORT=${PORT:-8000}
echo "Starting gunicorn on port $PORT with --preload..."

exec gunicorn src.api_server:app \
  --preload \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind "0.0.0.0:$PORT" \
  --workers 1 \
  --timeout 180 \
  --access-logfile - \
  --error-logfile -
