# Azure Production Deployment Guide

Complete step-by-step guide to deploy API-Watch to Azure with automated CI/CD.

---

## Prerequisites

1. **Azure Account**: [Sign up](https://azure.microsoft.com/free/) for free ($200 credit)
2. **Azure CLI**: Install from [here](https://docs.microsoft.com/cli/azure/install-azure-cli)
3. **GitHub Repository**: Your code pushed to GitHub

---

## Part 1: Backend Deployment (Azure App Service)

### Step 1: Login to Azure

```bash
az login
```

### Step 2: Create Resources

```bash
# Set variables
RESOURCE_GROUP="api-watch-rg"
LOCATION="eastus"
APP_SERVICE_PLAN="api-watch-plan"
BACKEND_APP_NAME="api-watch-backend-<YOUR-UNIQUE-ID>"  # Must be globally unique

# Create resource group
az group create --name $RESOURCE_GROUP --location $LOCATION

# Create App Service plan (B1 tier - $13/month, or F1 for free)
az appservice plan create \
  --name $APP_SERVICE_PLAN \
  --resource-group $RESOURCE_GROUP \
  --sku B1 \
  --is-linux

# Create web app with Python 3.11 runtime
az webapp create \
  --resource-group $RESOURCE_GROUP \
  --plan $APP_SERVICE_PLAN \
  --name $BACKEND_APP_NAME \
  --runtime "PYTHON:3.11"
```

### Step 3: Configure Backend

```bash
# Set startup command
az webapp config set \
  --resource-group $RESOURCE_GROUP \
  --name $BACKEND_APP_NAME \
  --startup-file "startup.sh"

# Configure environment variables
az webapp config appsettings set \
  --resource-group $RESOURCE_GROUP \
  --name $BACKEND_APP_NAME \
  --settings \
    PYTHON_ENV=production \
    LOG_LEVEL=INFO \
    SCM_DO_BUILD_DURING_DEPLOYMENT=true

# Enable logging
az webapp log config \
  --resource-group $RESOURCE_GROUP \
  --name $BACKEND_APP_NAME \
  --docker-container-logging filesystem
```

### Step 4: Get Publish Profile for GitHub Actions

```bash
az webapp deployment list-publishing-profiles \
  --name $BACKEND_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --xml > backend-publish-profile.xml
```

**Save this XML content** — you'll add it to GitHub secrets as `AZURE_WEBAPP_PUBLISH_PROFILE`.

### Step 5: Note Backend URL

```bash
echo "Backend URL: https://$BACKEND_APP_NAME.azurewebsites.net"
```

✅ **Backend is ready!** URL will be: `https://api-watch-backend-<YOUR-ID>.azurewebsites.net`

---

## Part 2: Frontend Deployment (Azure Static Web Apps)

### Step 1: Create Static Web App

```bash
FRONTEND_APP_NAME="api-watch-frontend"

az staticwebapp create \
  --name $FRONTEND_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --branch main \
  --app-location "/frontend" \
  --output-location "dist" \
  --token $GITHUB_TOKEN
```

> **Note**: If you don't have `$GITHUB_TOKEN`, you can create one at:  
> GitHub → Settings → Developer settings → Personal access tokens → Generate new token (classic)  
> Required scopes: `repo`, `workflow`

### Step 2: Get Deployment Token

```bash
az staticwebapp secrets list \
  --name $FRONTEND_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query "properties.apiKey" -o tsv
```

**Save this token** — you'll add it to GitHub secrets as `AZURE_STATIC_WEB_APPS_API_TOKEN`.

### Step 3: Note Frontend URL

```bash
az staticwebapp show \
  --name $FRONTEND_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query "defaultHostname" -o tsv
```

✅ **Frontend is ready!** URL will be: `https://<generated-name>.azurestaticapps.net`

---

## Part 3: GitHub Secrets Configuration

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add these 3 secrets:

| Secret Name | Value | Where to get it |
|---|---|---|
| `AZURE_WEBAPP_PUBLISH_PROFILE` | XML content from backend publish profile | Step 4 of Part 1 |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Deployment token from Static Web Apps | Step 2 of Part 2 |
| `AZURE_BACKEND_URL` | `https://api-watch-backend-<YOUR-ID>.azurewebsites.net` | Backend URL from Part 1 |

---

## Part 4: Deploy via GitHub Actions

The workflow at `.github/workflows/deploy-azure.yml` is already configured.

### Trigger Deployment

```bash
# Simply push to main branch
git add -A
git commit -m "chore: configure Azure deployment"
git push origin main
```

GitHub Actions will automatically:
1. ✅ Run backend tests (137 tests)
2. ✅ Deploy backend to Azure App Service
3. ✅ Run frontend tests (41 tests)
4. ✅ Build frontend with production backend URL
5. ✅ Deploy frontend to Azure Static Web Apps

**Check deployment status**:  
GitHub → Actions tab → Watch the "Deploy to Azure" workflow

---

## Part 5: Verify Deployment

### Test Backend Health

```bash
curl https://api-watch-backend-<YOUR-ID>.azurewebsites.net/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "api-watch-server"
}
```

### Test Frontend

Open your browser: `https://<frontend-name>.azurestaticapps.net`

You should see the API-Watch dashboard with all features working.

---

## Part 6: Update Frontend Environment

Update the backend URL in production config:

```bash
# Edit frontend/.env.production
VITE_API_URL=https://api-watch-backend-<YOUR-ID>.azurewebsites.net
```

Commit and push to trigger redeployment:

```bash
git add frontend/.env.production
git commit -m "chore: update production backend URL"
git push origin main
```

---

## Monitoring & Logs

### View Backend Logs

```bash
# Stream live logs
az webapp log tail --name $BACKEND_APP_NAME --resource-group $RESOURCE_GROUP

# Download logs
az webapp log download --name $BACKEND_APP_NAME --resource-group $RESOURCE_GROUP
```

### View Frontend Logs

Azure Portal → Static Web Apps → Your app → **Functions** → **Application Insights**

---

## Scaling & Performance

### Backend Scaling

```bash
# Scale to 2 instances
az appservice plan update \
  --name $APP_SERVICE_PLAN \
  --resource-group $RESOURCE_GROUP \
  --number-of-workers 2

# Or upgrade to S1 tier for auto-scaling
az appservice plan update \
  --name $APP_SERVICE_PLAN \
  --resource-group $RESOURCE_GROUP \
  --sku S1
```

### Enable Auto-Scaling

```bash
az monitor autoscale create \
  --resource-group $RESOURCE_GROUP \
  --resource $BACKEND_APP_NAME \
  --resource-type Microsoft.Web/sites \
  --name autoscale-apiwatch \
  --min-count 1 \
  --max-count 5 \
  --count 2
```

---

## Cost Estimates (Monthly)

| Component | Tier | Cost |
|---|---|---|
| **Backend** (App Service B1) | Basic | ~$13 |
| **Backend** (App Service F1) | Free | $0 |
| **Frontend** (Static Web Apps) | Free | $0 |
| **Total (Production)** | B1 + Free | **~$13/month** |
| **Total (Dev/Testing)** | F1 + Free | **$0/month** |

> 💡 **Tip**: Use F1 (free tier) for development/testing, upgrade to B1 for production.

---

## Custom Domain (Optional)

### Add Custom Domain to Backend

```bash
# Add domain
az webapp config hostname add \
  --webapp-name $BACKEND_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --hostname api.yourdomain.com

# Enable HTTPS
az webapp config ssl bind \
  --certificate-thumbprint <thumbprint> \
  --ssl-type SNI \
  --name $BACKEND_APP_NAME \
  --resource-group $RESOURCE_GROUP
```

### Add Custom Domain to Frontend

Azure Portal → Static Web Apps → Your app → **Custom domains** → Add domain

---

## Troubleshooting

### Backend not starting

Check logs:
```bash
az webapp log tail --name $BACKEND_APP_NAME --resource-group $RESOURCE_GROUP
```

Common fixes:
- Ensure `startup.sh` has execute permissions
- Check `requirements.txt` for missing dependencies
- Verify Python version matches (3.11)

### Frontend shows connection errors

1. Check backend URL in browser: `https://<backend>.azurewebsites.net/health`
2. Verify `AZURE_BACKEND_URL` secret matches actual backend URL
3. Check browser console for CORS errors
4. Verify `.env.production` has correct `VITE_API_URL`

### GitHub Actions failing

1. Verify all 3 secrets are set correctly
2. Check Actions tab for detailed error logs
3. Ensure publish profile XML is complete (includes `<publishData>` tags)

---

## Cleanup (Delete Everything)

```bash
# Delete entire resource group (removes all resources)
az group delete --name $RESOURCE_GROUP --yes --no-wait
```

---

## Quick Reference Commands

```bash
# View all resources
az resource list --resource-group $RESOURCE_GROUP -o table

# Restart backend
az webapp restart --name $BACKEND_APP_NAME --resource-group $RESOURCE_GROUP

# View backend URL
az webapp show --name $BACKEND_APP_NAME --resource-group $RESOURCE_GROUP --query defaultHostName -o tsv

# View frontend URL
az staticwebapp show --name $FRONTEND_APP_NAME --resource-group $RESOURCE_GROUP --query defaultHostname -o tsv

# Update backend environment variables
az webapp config appsettings set --name $BACKEND_APP_NAME --resource-group $RESOURCE_GROUP --settings NEW_VAR=value
```

---

## Next Steps

✅ **Deployed!** Your API-Watch is now live on Azure.

- 📊 **Monitor**: Azure Portal → App Service → Metrics
- 🔒 **Secure**: Add authentication via Azure AD
- 📈 **Scale**: Enable auto-scaling for production traffic
- 🌐 **Custom Domain**: Add your own domain name
- 📧 **Alerts**: Set up email notifications for errors

**Support**: Check `DEPLOYMENT.md` for alternative hosting options (Render, Railway, Vercel).
