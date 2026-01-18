# 🚀 Quick Deployment Checklist

Fast-track guide to deploy API-Watch in under 10 minutes.

## ✅ Pre-Deployment Checklist

- [ ] Code pushed to GitHub repository
- [ ] `render.yaml` exists in root directory
- [ ] `requirements.txt` is complete and up-to-date
- [ ] `src/webhook_server.py` has FastAPI `app` instance
- [ ] Sample reports generated in `public/` folder

---

## 🎯 Deploy Webhook Server (5 minutes)

### Option 1: Render (Recommended)

1. **Sign up**: [render.com](https://render.com) → Create account
2. **New Service**: Click "New +" → "Web Service"
3. **Connect GitHub**: Select `API-Watch` repository
4. **Auto-Deploy**: Render detects `render.yaml` automatically
5. **Click**: "Create Web Service"
6. **Wait**: 2-3 minutes for build & deploy
7. **Done**: Get URL like `https://api-watch-webhook.onrender.com`

**Test it:**
```bash
curl https://api-watch-webhook.onrender.com/webhook \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

### Option 2: Railway

```bash
npm i -g @railway/cli
railway login
railway init
railway up
```

---

## 📊 Deploy Reports (3 minutes)

### Cloudflare Pages

1. **Generate report**:
   ```bash
   python src/main.py suite --file examples/test_suite.yaml
   cp reports/report_*.html public/report.html
   git add public/ && git commit -m "Add reports" && git push
   ```

2. **Deploy**: 
   - Go to [pages.cloudflare.com](https://pages.cloudflare.com)
   - "Create a project" → Connect GitHub
   - Select `API-Watch`
   - Build output: `public`
   - Deploy

3. **Done**: Get URL like `https://api-watch.pages.dev`

---

## 📝 Update README with Live URLs

Replace placeholder URLs in [README.md](../README.md):

```markdown
**Live Demos:**
- 🌐 Webhook Server: `https://your-actual-url.onrender.com`
- 📊 Sample Reports: `https://your-actual-url.pages.dev`
```

---

## 🏷️ Add Deployment Badges

Add to top of README:

```markdown
[![Deployed on Render](https://img.shields.io/badge/Deployed-Render-46E3B7?logo=render)](https://your-url.onrender.com)
[![Reports](https://img.shields.io/badge/Reports-Cloudflare%20Pages-F38020?logo=cloudflare)](https://your-url.pages.dev)
```

---

## ✅ Final Verification

Test all endpoints:

```bash
# 1. Test webhook server
curl https://YOUR-URL.onrender.com/webhook -X POST -d '{"test":true}'

# 2. Check reports site
curl https://YOUR-URL.pages.dev

# 3. Verify GitHub repo is public
# Go to: https://github.com/yourusername/API-Watch
# Settings → Danger Zone → Change visibility → Public
```

---

## 🎯 For Your Resume

After deployment, you can claim:

> ✅ Deployed production API monitoring service on Render  
> ✅ Hosted static reports on Cloudflare Pages CDN  
> ✅ Built FastAPI webhook receiver with public HTTPS endpoint  
> ✅ Automated customer integration testing with 95%+ validation coverage  

---

## 🆘 Quick Troubleshooting

### Webhook Server Won't Start
- Check logs in Render dashboard
- Verify `requirements.txt` has all dependencies
- Ensure `src/webhook_server.py` has `app = FastAPI()`

### Reports Not Showing
- Verify `public/` folder has `index.html`
- Check Cloudflare build logs
- Ensure `public/` is committed to GitHub

### Free Tier Sleeping
- Render free tier sleeps after 15 min inactivity
- First request wakes it up (~30 seconds)
- Normal behavior, not an error

---

## 📚 Full Documentation

For detailed instructions, see [DEPLOYMENT.md](DEPLOYMENT.md)

---

**Time Estimate:** 
- Render deployment: 5 minutes
- Cloudflare Pages: 3 minutes  
- README updates: 2 minutes
- **Total: ~10 minutes** ⚡
