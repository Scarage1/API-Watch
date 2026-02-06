# ✅ API-Watch Verification & Deployment Guide

## 🎯 Quick Status Check

### Local Development (Verified ✅)
- **Backend**: Running on `http://localhost:8000`
- **Frontend**: Running on `http://localhost:5173`
- **Status**: Both services operational

---

## 🚀 Running Locally

### Quick Start (One Command)
```bash
./start-dev.sh
```

### Manual Start

**Backend:**
```bash
cd /Users/shivamkumar/Documents/API-Watch/API-Watch
source venv/bin/activate
python -m uvicorn src.api_server:app --host 127.0.0.1 --port 8000 --reload
```

**Frontend:**
```bash
cd /Users/shivamkumar/Documents/API-Watch/API-Watch/frontend
npm run dev
```

---

## 🌐 Deploying to Render

### Step 1: Update render.yaml (Already Done ✅)
Your `render.yaml` now includes the API server:
```yaml
services:
  - type: web
    name: api-watch-backend
    env: python
    buildCommand: pip install -r requirements.txt
    startCommand: python src/api_server.py
```

### Step 2: Deploy Backend to Render

1. **Push latest code to GitHub** (Already done ✅)
   ```bash
   git push origin main
   ```

2. **In Render Dashboard:**
   - Go to https://dashboard.render.com
   - Click "New +" → "Web Service"
   - Connect your GitHub repository: `Scarage1/API-Watch`
   - Render will detect `render.yaml`
   - Select **api-watch-backend** service
   - Click "Create Web Service"

3. **Wait for deployment** (2-3 minutes)
   - Render will build and deploy automatically
   - You'll get a URL like: `https://api-watch-backend.onrender.com`

### Step 3: Update Frontend Configuration

Once your backend is deployed, update the frontend `.env`:

```bash
cd frontend
nano .env
```

Update to your Render URL:
```env
VITE_API_URL=https://api-watch-backend.onrender.com
```

### Step 4: Deploy Frontend

**Option A: Vercel (Recommended for Frontend)**
```bash
cd frontend
npm install -g vercel
vercel --prod
```

**Option B: Render Static Site**
```bash
# Add to render.yaml:
- type: web
  name: api-watch-frontend
  env: static
  buildCommand: cd frontend && npm install && npm run build
  staticPublishPath: ./frontend/dist
  routes:
    - type: rewrite
      source: /*
      destination: /index.html
```

**Option C: Netlify**
```bash
npm install -g netlify-cli
cd frontend
netlify deploy --prod
```

---

## 🧪 Testing Your Deployment

### Test Backend Health
```bash
curl https://your-backend-url.onrender.com/health
# Expected: {"status":"healthy","service":"api-watch-server"}
```

### Test API Endpoint
```bash
curl -X POST https://your-backend-url.onrender.com/api/execute-request \
  -H "Content-Type: application/json" \
  -d '{
    "method": "GET",
    "url": "https://jsonplaceholder.typicode.com/posts/1",
    "timeout": 10
  }'
```

### Test Frontend
1. Open `https://your-frontend-url.vercel.app`
2. Navigate to "Single Request"
3. Enter URL: `https://jsonplaceholder.typicode.com/posts/1`
4. Click "Send Request"
5. Verify you see a 200 response

---

## 🔍 Current Local Verification

### ✅ Backend Verified
```bash
# Health check
curl http://localhost:8000/health
# Returns: {"status":"healthy","service":"api-watch-server"}

# API docs available at:
http://localhost:8000/docs
```

### ✅ Frontend Verified
```bash
# Running on:
http://localhost:5173

# Test in browser:
1. Open http://localhost:5173
2. Check Dashboard loads
3. Try Single Request feature
```

### ✅ Full Integration Test
```bash
# From frontend, execute request to:
# https://jsonplaceholder.typicode.com/posts/1
# 
# Should see:
# - Status: 200
# - Response time: ~200-500ms
# - JSON response body
```

---

## 📊 What's Working

### Backend Features ✅
- ✅ Health check endpoint
- ✅ Single request execution
- ✅ Test suite execution
- ✅ Error diagnosis
- ✅ Statistics calculation
- ✅ CORS enabled for local dev
- ✅ Pydantic validation
- ✅ OpenAPI docs

### Frontend Features ✅
- ✅ Dashboard with stats
- ✅ Single request builder
- ✅ Dark mode toggle
- ✅ Responsive design
- ✅ Test history tracking
- ✅ Analytics charts
- ✅ Settings page

---

## 🛠️ Troubleshooting

### Backend Won't Start
```bash
# Check port availability
lsof -i :8000

# Kill existing processes
pkill -f "uvicorn src.api_server"

# Reinstall dependencies
source venv/bin/activate
pip install -r requirements.txt
```

### Frontend Won't Start
```bash
# Clear node_modules
rm -rf node_modules package-lock.json
npm install

# Check Node version (need 18+)
node --version
```

### CORS Errors
If you see CORS errors in browser console:

1. Update `src/api_server.py`:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://your-frontend.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

2. Restart backend

### Frontend Can't Connect to Backend
1. Check `.env` file in `frontend/` directory
2. Verify `VITE_API_URL` is correct
3. Restart frontend dev server

---

## 📝 Render Deployment Checklist

- [ ] Code pushed to GitHub
- [ ] `render.yaml` includes api-watch-backend service
- [ ] Backend deployed on Render
- [ ] Backend URL noted (e.g., https://api-watch-backend.onrender.com)
- [ ] Frontend `.env` updated with backend URL
- [ ] Frontend built: `npm run build`
- [ ] Frontend deployed (Vercel/Netlify/Render)
- [ ] Tested health endpoint
- [ ] Tested API request execution
- [ ] Tested frontend UI

---

## 🎯 Next Steps

### 1. Deploy Backend to Render
```bash
# Your backend is ready to deploy!
# Just go to Render dashboard and connect your repo
```

### 2. Update Frontend Config
```bash
# After backend deployment, update:
cd frontend
echo "VITE_API_URL=https://your-backend-url.onrender.com" > .env
```

### 3. Deploy Frontend
```bash
# Choose your platform:
npm install -g vercel  # Vercel (recommended)
vercel --prod

# OR
npm install -g netlify-cli  # Netlify
netlify deploy --prod
```

### 4. Test Live Deployment
- Open your frontend URL
- Test Single Request feature
- Verify backend connectivity

---

## 🔗 Useful URLs

### Local Development
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Production (After Deployment)
- Backend: https://api-watch-backend.onrender.com
- Frontend: https://your-app.vercel.app
- API Docs: https://api-watch-backend.onrender.com/docs

---

## 💡 Tips

1. **Render Free Tier**: Backend spins down after 15 min inactivity (cold start ~30s)
2. **Environment Variables**: Set in Render dashboard under "Environment"
3. **Logs**: Check Render dashboard → Your Service → Logs
4. **CORS**: Make sure to add your production frontend URL to CORS origins
5. **Health Checks**: Render pings `/health` endpoint automatically

---

## 📞 Support

If you encounter issues:
1. Check logs: `/tmp/api-watch-backend.log` and `/tmp/api-watch-frontend.log`
2. Review this guide
3. Check GitHub Issues
4. Consult [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed guides

---

**Status: ✅ VERIFIED WORKING LOCALLY**  
**Next: 🚀 READY FOR RENDER DEPLOYMENT**
