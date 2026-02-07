# ============================================================
# API-Watch — Multi-stage Production Dockerfile
# Stage 1: Build React frontend (Node 22)
# Stage 2: Production Python backend (Python 3.11-slim)
# ============================================================

# ── Stage 1: Frontend Build ─────────────────────────────────
FROM node:22-alpine AS frontend-build

WORKDIR /build

# Install deps first (layer cache — only re-run if package.json changes)
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --prefer-offline

# Copy frontend source and build
COPY frontend/ ./
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build


# ── Stage 2: Production Backend ─────────────────────────────
FROM python:3.11-slim AS production

# Prevent Python from writing .pyc files and enable unbuffered stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    # Default port (Azure App Service sets PORT automatically)
    PORT=8000

WORKDIR /app

# Install system dependencies needed by asyncpg, bcrypt, etc.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies (layer cache — only re-run if requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY src/ ./src/
COPY alembic/ ./alembic/
COPY alembic.ini .
COPY examples/ ./examples/

# Copy built frontend from Stage 1
COPY --from=frontend-build /build/dist ./public/

# Copy entrypoint script
COPY docker-entrypoint.sh .
RUN chmod +x docker-entrypoint.sh

# Create non-root user for security
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --ingroup appgroup appuser

# Create writable directories for the app
RUN mkdir -p /app/data /app/logs && \
    chown -R appuser:appgroup /app/data /app/logs

# Switch to non-root user
USER appuser

# Health check — Azure also uses this
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

EXPOSE ${PORT}

ENTRYPOINT ["./docker-entrypoint.sh"]
