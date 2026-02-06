# 🚀 API-Watch Deployment Guide

## Development Setup

### Prerequisites
- Python 3.11+
- Node.js 18+
- npm or yarn

### Backend Setup

```bash
# Navigate to project root
cd API-Watch

# Create virtual environment
python -m venv venv

# Activate virtual environment
source venv/bin/activate  # On macOS/Linux
# venv\Scripts\activate  # On Windows

# Install dependencies
pip install -r requirements.txt

# Start API server
python src/api_server.py
# Server runs on http://localhost:8000
```

### Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
# Frontend runs on http://localhost:5173
```

### Access the Application
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

---

## Production Deployment

### Option 1: Docker Deployment (Recommended)

#### Create Dockerfile for Backend
```dockerfile
# backend.Dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

EXPOSE 8000

CMD ["python", "src/api_server.py"]
```

#### Create Dockerfile for Frontend
```dockerfile
# frontend.Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
```

#### Docker Compose
```yaml
# docker-compose.yml
version: '3.8'

services:
  backend:
    build:
      context: .
      dockerfile: backend.Dockerfile
    ports:
      - "8000:8000"
    environment:
      - PYTHON_ENV=production
    restart: unless-stopped

  frontend:
    build:
      context: .
      dockerfile: frontend.Dockerfile
    ports:
      - "80:80"
    depends_on:
      - backend
    environment:
      - VITE_API_URL=http://localhost:8000
    restart: unless-stopped
```

```bash
# Build and run
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

---

### Option 2: Cloud Deployment

#### A. Render.com (Simple PaaS)

**Backend (render.yaml already exists)**
```yaml
services:
  - type: web
    name: api-watch-backend
    env: python
    plan: free
    buildCommand: pip install -r requirements.txt
    startCommand: python src/api_server.py
    envVars:
      - key: PYTHON_VERSION
        value: 3.11.0
```

**Frontend**
```yaml
  - type: web
    name: api-watch-frontend
    env: node
    plan: free
    buildCommand: cd frontend && npm install && npm run build
    staticPublishPath: ./frontend/dist
    routes:
      - type: rewrite
        source: /*
        destination: /index.html
    envVars:
      - key: VITE_API_URL
        value: https://api-watch-backend.onrender.com
```

#### B. Vercel + Railway

**Frontend on Vercel**
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd frontend
vercel --prod
```

**Backend on Railway**
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Init and deploy
railway init
railway up
```

#### C. AWS (Enterprise)

**Backend: EC2 + Nginx**
```bash
# Install dependencies
sudo apt update
sudo apt install python3.11 python3-pip nginx

# Clone repo
git clone <your-repo>
cd API-Watch

# Setup virtual environment
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Install PM2 for process management
sudo npm install -g pm2

# Start backend with PM2
pm2 start src/api_server.py --interpreter python --name api-watch-backend

# Configure Nginx reverse proxy
sudo nano /etc/nginx/sites-available/api-watch

# Add configuration:
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Enable and restart
sudo ln -s /etc/nginx/sites-available/api-watch /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

**Frontend: S3 + CloudFront**
```bash
# Build frontend
cd frontend
npm run build

# Deploy to S3
aws s3 sync dist/ s3://your-bucket-name --delete

# Configure CloudFront distribution
# Point to S3 bucket with proper cache settings
```

---

### Option 3: Kubernetes

```yaml
# k8s-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-watch-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-watch-backend
  template:
    metadata:
      labels:
        app: api-watch-backend
    spec:
      containers:
      - name: backend
        image: your-registry/api-watch-backend:latest
        ports:
        - containerPort: 8000
        env:
        - name: PYTHON_ENV
          value: "production"
---
apiVersion: v1
kind: Service
metadata:
  name: api-watch-backend-service
spec:
  selector:
    app: api-watch-backend
  ports:
    - protocol: TCP
      port: 80
      targetPort: 8000
  type: LoadBalancer
```

```bash
# Apply configuration
kubectl apply -f k8s-deployment.yaml

# Check status
kubectl get pods
kubectl get services
```

---

## Environment Variables

### Backend (.env)
```env
PYTHON_ENV=production
LOG_LEVEL=INFO
ALLOWED_ORIGINS=https://your-frontend.com
```

### Frontend (.env.production)
```env
VITE_API_URL=https://api.your-domain.com
```

---

## Monitoring & Logging

### Application Monitoring
```bash
# PM2 monitoring
pm2 monit

# View logs
pm2 logs api-watch-backend

# Setup log rotation
pm2 install pm2-logrotate
```

### Health Checks
- Backend: http://your-api.com/health
- Frontend: Check if page loads

### Uptime Monitoring
- Use tools like: Pingdom, UptimeRobot, or StatusCake

---

## SSL/TLS Configuration

### Let's Encrypt (Free)
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal (already configured by Certbot)
sudo certbot renew --dry-run
```

---

## Backup Strategy

```bash
# Backup test history and configurations
tar -czf api-watch-backup-$(date +%Y%m%d).tar.gz \
  logs/ \
  reports/ \
  examples/

# Automated daily backups
crontab -e
# Add: 0 2 * * * /path/to/backup-script.sh
```

---

## Performance Optimization

### Backend
- Use Gunicorn for production: `gunicorn src.api_server:app -w 4 -k uvicorn.workers.UvicornWorker`
- Enable gzip compression
- Add Redis for caching
- Use database for test history

### Frontend
- Enable CDN (CloudFlare, CloudFront)
- Optimize images
- Enable service workers for PWA
- Use lazy loading for routes

---

## Security Checklist

- [ ] Enable HTTPS
- [ ] Configure CORS properly
- [ ] Add rate limiting
- [ ] Implement authentication
- [ ] Sanitize inputs
- [ ] Enable security headers
- [ ] Regular dependency updates
- [ ] Monitor for vulnerabilities

---

## Troubleshooting

### Backend won't start
```bash
# Check port availability
lsof -i :8000

# Check Python version
python --version

# Reinstall dependencies
pip install -r requirements.txt --force-reinstall
```

### Frontend build fails
```bash
# Clear cache
rm -rf node_modules package-lock.json
npm install

# Check Node version
node --version
```

### CORS errors
- Verify VITE_API_URL in frontend .env
- Check CORS configuration in api_server.py
- Ensure backend is running

---

## Support

For issues and questions:
- GitHub Issues: [your-repo/issues]
- Documentation: [your-docs-site]
- Email: support@your-domain.com
