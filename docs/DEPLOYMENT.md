# 🚀 Deployment Guide

Complete guide to deploying API-Watch components to production.

## Overview

API-Watch has two deployable components:

| Component | Description | Recommended Platform |
|-----------|-------------|---------------------|
| **Webhook Server** | FastAPI server for webhook testing | Render (Free tier) |
| **HTML Reports** | Static report hosting | Cloudflare Pages (Free) |
| **CLI Tool** | Local execution only | Not deployed |

---

## Part 1: Deploy Webhook Server to Render

### Prerequisites
- GitHub account
- API-Watch repository pushed to GitHub
- Render account (free signup)

### Steps

#### 1. Push to GitHub

```bash
cd API-Watch
git add .
git commit -m "Prepare for deployment"
git push origin main
```

#### 2. Sign up for Render

Visit [render.com](https://render.com) and create a free account.

#### 3. Create New Web Service

1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub account
3. Select the `API-Watch` repository
4. Render will auto-detect `render.yaml`

#### 4. Configure Service (Auto-configured via render.yaml)

```yaml
Service Name: api-watch-webhook
Environment: Python
Build Command: pip install -r requirements.txt
Start Command: uvicorn src.webhook_server:app --host 0.0.0.0 --port 10000
Plan: Free
```

#### 5. Deploy

Click **"Create Web Service"** and wait 2-3 minutes for deployment.

#### 6. Get Your Public URL

After deployment succeeds:
```
https://api-watch-webhook.onrender.com
```

Your webhook endpoint:
```
https://api-watch-webhook.onrender.com/webhook
```

### Testing Your Deployed Webhook

```bash
# Test POST request
curl -X POST https://api-watch-webhook.onrender.com/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "message.delivered",
    "message_id": "test-123",
    "status": "success"
  }'

# Expected response:
# {"status": "received", "payload": {...}}
```

### Monitoring

Render provides:
- **Logs**: Real-time log streaming
- **Metrics**: CPU, memory usage
- **Uptime**: Free tier may sleep after inactivity (wakes on request)

**Note:** Free tier services sleep after 15 minutes of inactivity. First request after sleep takes ~30 seconds.

---

## Part 2: Deploy Reports to Cloudflare Pages

### Prerequisites
- Cloudflare account (free signup)
- Generated HTML reports in `public/` folder

### Steps

#### 1. Generate Sample Reports

```bash
# Run test suite to generate report
python src/main.py suite --file examples/customer_onboarding_suite.yaml

# Copy latest report to public folder
cp reports/report_*.html public/report.html

# Or create a symlink
# Windows: mklink public\report.html reports\report_latest.html
# Linux/Mac: ln -s ../reports/report_latest.html public/report.html
```

#### 2. Push to GitHub

```bash
git add public/
git commit -m "Add sample HTML reports"
git push origin main
```

#### 3. Deploy to Cloudflare Pages

1. Visit [dash.cloudflare.com/pages](https://dash.cloudflare.com/pages)
2. Click **"Create a project"**
3. Connect GitHub and select `API-Watch`
4. Configure build:
   - **Project name**: `api-watch`
   - **Build command**: (leave empty)
   - **Build output directory**: `public`
5. Click **"Save and Deploy"**

#### 4. Get Your Reports URL

```
https://api-watch.pages.dev
```

View your report:
```
https://api-watch.pages.dev/report.html
```

### Auto-Update Reports

To automatically update reports:

```bash
# Generate new report
python src/main.py suite --file examples/test_suite.yaml

# Copy to public
cp reports/report_latest.html public/report.html

# Push to GitHub (Cloudflare auto-deploys)
git add public/report.html
git commit -m "Update test report"
git push origin main
```

Cloudflare automatically rebuilds and deploys on every push.

---

## Part 3: Alternative Deployment Options

### Railway

**Pros:** Very easy, similar to Render
**Cons:** Free tier changes frequently

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Deploy
railway up

# Get URL
railway open
```

### Fly.io

**Pros:** More control, Docker-based
**Cons:** Slightly more complex

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Launch (creates fly.toml)
fly launch

# Deploy
fly deploy

# Get URL
fly status
```

### Heroku

**Pros:** Well-known, easy to use
**Cons:** No free tier anymore

```bash
# Install Heroku CLI
# Create Procfile
echo "web: uvicorn src.webhook_server:app --host 0.0.0.0 --port \$PORT" > Procfile

# Deploy
heroku create api-watch-webhook
git push heroku main
```

### Docker Anywhere

**Build Docker image:**

```dockerfile
# Create Dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ src/
EXPOSE 8080

CMD ["uvicorn", "src.webhook_server:app", "--host", "0.0.0.0", "--port", "8080"]
```

```bash
# Build
docker build -t api-watch-webhook .

# Run locally
docker run -p 8080:8080 api-watch-webhook

# Push to registry
docker tag api-watch-webhook yourusername/api-watch-webhook
docker push yourusername/api-watch-webhook
```

Deploy to:
- AWS ECS
- Google Cloud Run
- Azure Container Instances
- DigitalOcean App Platform

---

## Part 4: Environment Variables

### For Production Deployment

Create environment variables in your hosting platform:

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `10000` (Render default) |
| `LOG_LEVEL` | Logging level | `info` |
| `CORS_ORIGINS` | Allowed origins | `*` or specific domains |

**Setting in Render:**
1. Go to your service dashboard
2. Click **"Environment"**
3. Add variables
4. Redeploy

---

## Part 5: Custom Domain (Optional)

### Add Custom Domain to Render

1. Go to your service **Settings**
2. Scroll to **"Custom Domain"**
3. Add domain: `webhooks.yourdomain.com`
4. Update DNS records as instructed:
   ```
   Type: CNAME
   Name: webhooks
   Value: api-watch-webhook.onrender.com
   ```

### Add Custom Domain to Cloudflare Pages

1. Go to your Pages project
2. Click **"Custom domains"**
3. Add domain: `reports.yourdomain.com`
4. DNS automatically configured (if using Cloudflare DNS)

---

## Troubleshooting

### Webhook Server Not Starting

**Check logs in Render:**
```bash
# View logs in Render dashboard
# Common issues:
# - Missing dependencies in requirements.txt
# - Wrong Python version
# - Port binding issues
```

**Solution:**
- Verify `requirements.txt` is complete
- Check `render.yaml` configuration
- Review build logs for errors

### Reports Not Updating

**Issue:** Cloudflare Pages not rebuilding

**Solution:**
```bash
# Force rebuild by committing change
git add public/
git commit -m "Force rebuild"
git push origin main
```

### Free Tier Limitations

**Render Free Tier:**
- ⚠️ Sleeps after 15 minutes inactivity
- ⚠️ 750 hours/month (shared across services)
- ✅ Automatic HTTPS
- ✅ 512MB RAM

**Cloudflare Pages:**
- ✅ Unlimited bandwidth
- ✅ Unlimited requests
- ✅ 500 builds/month
- ✅ Custom domains

---

## Resume/Portfolio Impact

After deploying, you can showcase:

### On Resume
> **API-Watch** - API Debugging & Monitoring Toolkit
> - Deployed production webhook server on Render with public HTTPS endpoint
> - Automated customer integration testing with 95%+ validation coverage
> - Built FastAPI service with intelligent retry logic and auto-diagnosis
> - Hosted static reports on Cloudflare Pages CDN

### On GitHub README

Add badges:
```markdown
[![Deployed on Render](https://img.shields.io/badge/Deployed-Render-46E3B7?logo=render)](https://api-watch-webhook.onrender.com)
[![Reports on Cloudflare](https://img.shields.io/badge/Reports-Cloudflare%20Pages-F38020?logo=cloudflare)](https://api-watch.pages.dev)
```

---

## Next Steps

1. ✅ Deploy webhook server to Render
2. ✅ Deploy reports to Cloudflare Pages
3. ✅ Update README with live URLs
4. ✅ Add deployment badges
5. ✅ Test endpoints publicly
6. ✅ Share on LinkedIn/portfolio

**Questions?** Check the main [README.md](../README.md) or open an issue.
