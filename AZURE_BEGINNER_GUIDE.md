# Azure Deployment Guide for Beginners

**Total Time: ~15 minutes**  
**Cost: FREE for first month** (Azure gives you $200 credit)

This guide assumes you've never used Azure before. Follow step by step.

---

## 🚀 Part 1: Create Azure Account (5 minutes)

### Step 1: Sign Up

1. Go to: https://azure.microsoft.com/free/
2. Click **"Start free"**
3. Sign in with your Microsoft account (or create one)
4. Fill in your details:
   - Phone number (for verification)
   - Credit card (won't be charged, just for verification)
   - Accept terms

✅ **You now have**: $200 free credit for 30 days + 12 months of free services

---

## 💻 Part 2: Install Azure CLI (3 minutes)

Azure CLI lets you control Azure from your terminal.

### On macOS (you're on Mac):

```bash
# Install with Homebrew
brew update && brew install azure-cli
```

**Verify installation:**
```bash
az --version
```

You should see something like: `azure-cli 2.x.x`

---

## 🔐 Part 3: Login to Azure (2 minutes)

```bash
az login
```

**What happens:**
1. A browser window opens
2. Login with your Microsoft account (same one from Step 1)
3. Terminal shows: "You have logged in"
4. Close browser, return to terminal

**Verify you're logged in:**
```bash
az account show
```

You should see your account details in JSON format.

---

## 🏗️ Part 4: Create Backend (App Service) - Step by Step

### Step 4.1: Choose a unique name for your backend

Your backend URL will be: `https://YOUR-NAME.azurewebsites.net`

```bash
# Replace "myname" with your actual name (lowercase, no spaces)
BACKEND_NAME="apiwatch-myname"

# Check if name is available
az webapp list --query "[?name=='$BACKEND_NAME']" -o table
```

If you see "No results", the name is available! ✅

### Step 4.2: Create resource group

Think of this as a folder that holds all your Azure stuff.

```bash
az group create \
  --name apiwatch-rg \
  --location eastus
```

**What you'll see:**
```json
{
  "id": "/subscriptions/.../resourceGroups/apiwatch-rg",
  "location": "eastus",
  "name": "apiwatch-rg",
  "properties": {
    "provisioningState": "Succeeded"
  }
}
```

✅ **Success!** Your "folder" is created.

### Step 4.3: Create App Service Plan

This is like choosing a server size. We'll use **FREE tier** (F1) for testing.

```bash
az appservice plan create \
  --name apiwatch-plan \
  --resource-group apiwatch-rg \
  --sku F1 \
  --is-linux
```

**Takes 30 seconds.** You'll see a LOT of JSON output. Look for:
```json
"provisioningState": "Succeeded"
```

✅ **Success!** Your server plan is ready (FREE tier).

### Step 4.4: Create the Web App (Backend)

```bash
az webapp create \
  --resource-group apiwatch-rg \
  --plan apiwatch-plan \
  --name $BACKEND_NAME \
  --runtime "PYTHON:3.11"
```

**Takes 1-2 minutes.** You'll see lots of output. Look for:
```json
"state": "Running",
"defaultHostName": "apiwatch-myname.azurewebsites.net"
```

✅ **Success!** Your backend is live at: `https://apiwatch-myname.azurewebsites.net`

### Step 4.5: Configure startup

```bash
az webapp config set \
  --resource-group apiwatch-rg \
  --name $BACKEND_NAME \
  --startup-file "startup.sh"
```

✅ **Done!** Tells Azure how to start your Python app.

### Step 4.6: Get publish profile (for GitHub)

```bash
az webapp deployment list-publishing-profiles \
  --name $BACKEND_NAME \
  --resource-group apiwatch-rg \
  --xml > ~/Desktop/backend-publish.xml
```

✅ **File saved to your Desktop**: `backend-publish.xml`

**Don't open it yet!** We'll use it in Part 6.

---

## 🌐 Part 5: Create Frontend (Static Web App)

### Step 5.1: Get GitHub Personal Access Token

1. Go to: https://github.com/settings/tokens
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. Name it: "Azure Deployment"
4. Check these boxes:
   - ✅ **repo** (all sub-options)
   - ✅ **workflow**
5. Click **"Generate token"** at bottom
6. **COPY THE TOKEN** (you can't see it again!)

```bash
# Save it to a variable (paste your token after =)
GITHUB_TOKEN="ghp_YOUR_TOKEN_HERE"
```

### Step 5.2: Create Static Web App

```bash
az staticwebapp create \
  --name apiwatch-frontend \
  --resource-group apiwatch-rg \
  --location eastus2 \
  --branch main \
  --app-location "/frontend" \
  --output-location "dist" \
  --token $GITHUB_TOKEN
```

**Takes 2-3 minutes.** You'll see:
```json
"defaultHostname": "something-random.azurestaticapps.net",
"repositoryUrl": "https://github.com/Scarage1/API-Watch"
```

✅ **Success!** Your frontend is at: `https://something.azurestaticapps.net`

### Step 5.3: Get deployment token

```bash
az staticwebapp secrets list \
  --name apiwatch-frontend \
  --resource-group apiwatch-rg \
  --query "properties.apiKey" -o tsv > ~/Desktop/frontend-token.txt
```

✅ **File saved to Desktop**: `frontend-token.txt`

---

## 🔑 Part 6: Add Secrets to GitHub

Now we connect GitHub to Azure so it can auto-deploy.

### Step 6.1: Open GitHub Secrets page

Open this link in your browser:
```
https://github.com/Scarage1/API-Watch/settings/secrets/actions
```

### Step 6.2: Add Backend Secret

1. Click **"New repository secret"**
2. Name: `AZURE_WEBAPP_PUBLISH_PROFILE`
3. Open `~/Desktop/backend-publish.xml` in TextEdit
4. **Copy ALL the text** (it's long XML code)
5. **Paste** into Value field
6. Click **"Add secret"**

✅ **Secret 1 added!**

### Step 6.3: Add Frontend Secret

1. Click **"New repository secret"** again
2. Name: `AZURE_STATIC_WEB_APPS_API_TOKEN`
3. Open `~/Desktop/frontend-token.txt` in TextEdit
4. **Copy the token** (long string like: `abc123...`)
5. **Paste** into Value field
6. Click **"Add secret"**

✅ **Secret 2 added!**

### Step 6.4: Add Backend URL Secret

1. Click **"New repository secret"** one more time
2. Name: `AZURE_BACKEND_URL`
3. Value: `https://apiwatch-myname.azurewebsites.net`
   - ⚠️ Replace "myname" with YOUR backend name from Step 4.1
4. Click **"Add secret"**

✅ **All 3 secrets added!**

---

## 🚀 Part 7: Deploy! (Automatic)

The GitHub Actions workflow is already in your repo (`.github/workflows/deploy-azure.yml`).

### Trigger Deployment

Option 1 - Manual trigger:
1. Go to: https://github.com/Scarage1/API-Watch/actions
2. Click **"Deploy to Azure"** on the left
3. Click **"Run workflow"** button (top right)
4. Click green **"Run workflow"** button

Option 2 - Push to trigger:
```bash
# Make any small change
echo "# Deployed to Azure!" >> README.md
git add README.md
git commit -m "chore: trigger Azure deployment"
git push origin main
```

### Watch Deployment

1. Go to: https://github.com/Scarage1/API-Watch/actions
2. Click on the running workflow (orange circle)
3. Watch the steps:
   - ✅ Run backend tests (137 tests)
   - ✅ Deploy to Azure Web App
   - ✅ Run frontend tests (41 tests)
   - ✅ Build frontend
   - ✅ Deploy to Azure Static Web Apps

**Takes 3-5 minutes.**

---

## ✅ Part 8: Test Your Live App!

### Test Backend

Open in browser:
```
https://apiwatch-myname.azurewebsites.net/health
```

You should see:
```json
{
  "status": "healthy",
  "service": "api-watch-server"
}
```

### Test Frontend

Open in browser:
```
https://something-random.azurestaticapps.net
```

You should see your API-Watch dashboard! 🎉

---

## 🎓 What You Just Built

You now have:

- ✅ **Backend API** running on Azure App Service
- ✅ **Frontend** running on Azure Static Web Apps  
- ✅ **Auto-deployment** via GitHub Actions
- ✅ **178 tests** running before each deploy
- ✅ **HTTPS** enabled (automatic)
- ✅ **Global CDN** for fast loading worldwide
- ✅ **FREE for 12 months** (then ~$13/month)

---

## 🛠️ Common Issues & Fixes

### Issue 1: "Name not available" error

**Fix:** Choose a different backend name. Try adding numbers:
```bash
BACKEND_NAME="apiwatch-myname123"
```

### Issue 2: Backend shows "503 Service Unavailable"

**Fix:** Wait 2-3 minutes after deployment. First startup is slow.

**Or check logs:**
```bash
az webapp log tail --name $BACKEND_NAME --resource-group apiwatch-rg
```

### Issue 3: Frontend shows "Cannot connect to backend"

**Fix 1:** Update frontend environment variable:
```bash
# Edit this file
nano frontend/.env.production
```

Change to:
```
VITE_API_URL=https://apiwatch-myname.azurewebsites.net
```

Then push:
```bash
git add frontend/.env.production
git commit -m "fix: update backend URL"
git push origin main
```

**Fix 2:** Check CORS is enabled (it already is in your `api_server.py`):
```python
allow_origins=["*"]  # ✅ This allows all origins
```

### Issue 4: GitHub Actions failing

**Fix:** Check secrets are added correctly:
```
https://github.com/Scarage1/API-Watch/settings/secrets/actions
```

You should see 3 secrets with green checkmarks.

---

## 📊 View Logs & Monitor

### Backend Logs (Real-time)

```bash
az webapp log tail --name $BACKEND_NAME --resource-group apiwatch-rg
```

Press `Ctrl+C` to stop.

### Download All Logs

```bash
az webapp log download --name $BACKEND_NAME --resource-group apiwatch-rg
```

Saves to: `webapp_logs.zip`

### View in Azure Portal (Web Interface)

1. Go to: https://portal.azure.com
2. Click **"App Services"** on left
3. Click your backend name
4. Click **"Log stream"** on left menu
5. See live logs in browser

---

## 💰 Cost Tracking

Check your usage:
```bash
az consumption usage list --output table
```

Or visit: https://portal.azure.com/#blade/Microsoft_Azure_Billing/SubscriptionsBlade

---

## 🔄 Update Your App

Just push to GitHub:
```bash
# Make changes to your code
# Then:
git add -A
git commit -m "feat: my new feature"
git push origin main
```

GitHub Actions automatically:
1. Runs all tests
2. Builds everything
3. Deploys if tests pass
4. Sends you an email notification

---

## 🗑️ Delete Everything (If Needed)

To remove all Azure resources and stop charges:

```bash
az group delete --name apiwatch-rg --yes --no-wait
```

⚠️ **This deletes EVERYTHING** in the resource group. No undo.

---

## 📞 Need Help?

1. **Check workflow logs**: https://github.com/Scarage1/API-Watch/actions
2. **Check backend logs**: `az webapp log tail --name $BACKEND_NAME --resource-group apiwatch-rg`
3. **Azure docs**: https://docs.microsoft.com/azure
4. **Check backend health**: `https://YOUR-BACKEND.azurewebsites.net/health`

---

## 🎉 You're Done!

Your app is now:
- ✅ Live on the internet
- ✅ Automatically deployed
- ✅ Running on professional infrastructure
- ✅ Ready for production traffic

**Next steps:**
- Share your frontend URL with others
- Add a custom domain (optional)
- Scale up when you get traffic
- Monitor with Azure Application Insights

Congratulations! 🎊
