# API-Watch 🔍

**API Debugging & Monitoring Toolkit for Customer Integrations (FDE Utility)**

> **Watch, debug, and monitor REST APIs — Built for Forward Deployed Engineers**

[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/Scarage1/API-Watch.svg?style=social)](https://github.com/Scarage1/API-Watch/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/Scarage1/API-Watch.svg)](https://github.com/Scarage1/API-Watch/commits/main)

**API-Watch** is a production-ready CLI toolkit that helps Forward Deployed Engineers, Customer Success teams, and API integrators test, debug, and validate customer API integrations with intelligent retry logic, automated error diagnosis, and beautiful reporting.

---

## 🌟 Features

### Core Capabilities
✅ **React Dashboard** - Modern React 19 frontend with dark mode, charts, and real-time testing  
✅ **API Request Runner** - Supports GET, POST, PUT, DELETE with full configuration  
✅ **Smart Authentication** - Bearer Token, API Key, and Basic Auth support  
✅ **Intelligent Retry Logic** - Exponential backoff for 429 rate limits and 5xx server errors  
✅ **Auto-Diagnosis Engine** - Detects and explains common API failures with troubleshooting steps  
✅ **Detailed Logging** - Captures request/response details, latency, payload sizes, and errors  
✅ **Report Generation** - Beautiful HTML dashboards and machine-readable JSON reports  
✅ **YAML Test Suites** - Define and run complete onboarding validation workflows  
✅ **Webhook Test Server** - Local FastAPI server to receive and log webhook payloads  
✅ **Docker Ready** - Full Docker Compose setup for one-command deployment  

  
---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     API-Watch Architecture                   │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐         ┌──────────────────────────────┐
│   CLI Entry  │────────▶│   YAML Test Suite Parser     │
│  (main.py)   │         │  (Loads customer test cases) │
└──────────────┘         └──────────────────────────────┘
                                       │
                                       ▼
                         ┌─────────────────────────────┐
                         │   Request Runner Engine     │
                         │  - Auth Handler             │
                         │  - Retry Logic              │
                         │  - Timeout Management       │
                         └─────────────────────────────┘
                                       │
                   ┌───────────────────┼───────────────────┐
                   ▼                   ▼                   ▼
          ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
          │ Auto-Diagnosis │  │  Logger        │  │ Report Builder │
          │ Engine         │  │  (JSON/CSV)    │  │ (HTML/JSON)    │
          └────────────────┘  └────────────────┘  └────────────────┘
                   │                   │                   │
                   └───────────────────┴───────────────────┘
                                       ▼
                         ┌─────────────────────────────┐
                         │   Output Artifacts          │
                         │  • logs/requests.log        │
                         │  • reports/report.html      │
                         │  • reports/report.json      │
                         └─────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│              Webhook Test Server (Optional)                 │
│  FastAPI server on localhost:8080 to test webhooks         │
└────────────────────────────────────────────────────────────┘
```

**Key Components:**
- **CLI Entry**: Command-line interface for running tests
- **Test Suite Parser**: Reads and validates YAML test configurations
- **Request Runner**: Executes HTTP requests with auth, retries, and timeouts
- **Auto-Diagnosis**: Analyzes failures and provides troubleshooting steps
- **Report Builder**: Generates shareable HTML/JSON reports
- **Webhook Server**: Local endpoint for webhook development and testing

---

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/Scarage1/API-Watch.git
cd API-Watch

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Setup Environment

```bash
# Copy sample environment file
cp examples/env.sample .env

# Edit .env with your API credentials
# Add your API_TOKEN, API_KEY, BASE_URL, etc.
```

---

## � Example Output

### Terminal Output

Run the toolkit and see color-coded status indicators, response times, and diagnostics right in your terminal.

### HTML Report

Beautiful HTML dashboard with test results, diagnostics, and troubleshooting steps.

**Key Report Features:**
- ✅ Pass/Fail status for each test
- ⏱️ Response time metrics
- 📊 Success rate summary
- 🔍 Automatic error diagnosis
- 💡 Actionable troubleshooting suggestions
- 📋 Complete request/response details

---

## 🧪 How to Run Smoke Tests

### 1. Single API Request Test

Test a single endpoint quickly:

```bash
# Test a GET endpoint
python src/main.py request --method GET --url https://api.example.com/health

# Test with authentication
python src/main.py request \
  --method GET \
  --url https://api.plivo.com/v1/Account/MAXXXXXX/ \
  --bearer YOUR_AUTH_TOKEN
```

**Output:**
```
✓ Request successful (200 OK)
⏱️  Response time: 245ms
📦 Response size: 1.2KB
```

### 2. Run Complete Test Suite

Run customer onboarding validation:

```bash
# Run customer onboarding test suite
python src/main.py suite --file examples/customer_onboarding_suite.yaml

# Run with verbose logging
python src/main.py suite --file examples/customer_onboarding_suite.yaml --verbose
```

**What it does:**
1. Reads YAML test configuration
2. Executes all tests sequentially
3. Automatically retries failures
4. Generates HTML + JSON reports
5. Saves detailed logs

**Generated Reports:**
- `reports/report_2026-01-19_14-30-45.html` - Visual dashboard
- `reports/report_2026-01-19_14-30-45.json` - Machine-readable data
- `logs/2026-01-19_14-30-45.log` - Detailed execution logs

### 3. Customer Onboarding Test Suite

Use the pre-built customer onboarding suite:

```bash
python src/main.py suite --file examples/customer_onboarding_suite.yaml
```

This suite validates:
- ✅ Account authentication
- ✅ Profile retrieval
- ✅ Resource creation (tickets, messages, etc.)
- ✅ Webhook configuration
- ✅ Rate limit handling
- ✅ Error scenarios

---

## 🔗 How Webhook Testing Works

### Why Test Webhooks Locally?

**Problem:** Testing webhooks in production is risky and slow
- Can't test without deploying to a public server
- ngrok/localtunnel require extra setup
- Hard to debug payload issues

**Solution:** API-Watch includes a local webhook server

### Start the Webhook Server

```bash
# Start webhook server on default port (8080)
python src/webhook_server.py

# Use custom port
python src/webhook_server.py --port 9000
```

**Server Features:**
- Receives POST requests on `/webhook`
- Logs all incoming payloads
- Returns 200 OK automatically
- Saves payloads to `logs/webhooks/`

### Test Webhook Integration

1. **Start the server:**
   ```bash
   python src/webhook_server.py --port 8080
   ```

2. **Configure your API to send webhooks to:**
   ```
   http://localhost:8080/webhook
   ```

3. **View logged payloads:**
   ```bash
   cat logs/webhooks/webhook_2026-01-19_14-30-45.json
   ```

**Example logged payload:**
```json
{
  "timestamp": "2026-01-19T14:30:45Z",
  "headers": {
    "Content-Type": "application/json",
    "X-Webhook-Signature": "sha256=..."
  },
  "body": {
    "event": "message.delivered",
    "message_uuid": "123-456-789",
    "status": "delivered"
  }
}
```

### Use Cases
- ✅ Test webhook payloads before production
- ✅ Debug webhook signature validation
- ✅ Validate JSON structure
- ✅ Test rate limiting and retry logic

---

## 🛠️ Troubleshooting

### Common Issues and Solutions

#### ❌ **401 Unauthorized**
**Diagnosis:** Invalid or missing authentication token

**Solutions:**
1. Check your `.env` file has the correct `API_TOKEN`
2. Verify token hasn't expired
3. Ensure token has proper format (Bearer vs API Key)

```bash
# Verify token
echo $API_TOKEN

# Test with explicit token
python src/main.py request --url YOUR_URL --bearer YOUR_TOKEN
```

#### ❌ **403 Forbidden**
**Diagnosis:** Valid auth but insufficient permissions

**Solutions:**
1. Check API key has required scopes/permissions
2. Verify account is not suspended
3. Contact API provider to verify access level

#### ❌ **429 Rate Limited**
**Diagnosis:** Too many requests

**Solutions:**
- API-Watch automatically retries with exponential backoff
- Adjust retry settings in your test suite:
  ```yaml
  defaults:
    retries: 5
    timeout_seconds: 10
  ```

#### ❌ **Connection Timeout**
**Diagnosis:** Network latency or slow endpoint

**Solutions:**
1. Check internet connection
2. Increase timeout in test suite:
   ```yaml
   defaults:
     timeout_seconds: 30
   ```
3. Verify endpoint URL is correct

#### ❌ **SSL Certificate Error**
**Diagnosis:** Invalid or self-signed certificate

**Solutions:**
```bash
# For development only - disable SSL verification
python src/main.py request --url YOUR_URL --no-verify-ssl
```

### Debug Mode

Run with verbose logging:

```bash
# Enable debug output
python src/main.py suite --file examples/test_suite.yaml --verbose

# Check detailed logs
cat logs/LATEST.log
```

---

## 📋 Test Suite Format

Create a YAML file for your smoke tests:

```yaml
name: "Customer Onboarding Smoke Tests"
base_url: "https://api.example.com"

defaults:
  headers:
    Content-Type: "application/json"
  timeout_seconds: 8
  retries: 3

auth:
  type: bearer
  token_env: API_TOKEN

tests:
  - id: health_check
    method: GET
    path: /health

  - id: get_profile
    method: GET
    path: /v1/profile

  - id: create_ticket
    method: POST
    path: /v1/tickets
    body:
      title: "Test ticket"
      priority: "high"
```

---

## 🔍 Features Deep Dive

### Auto-Diagnosis Engine

The toolkit automatically diagnoses common API failures:

| Status Code | Diagnosis | Actionable Suggestion |
|-------------|-----------|----------------------|
| **401** | Token missing/expired | Check `.env` file and verify `API_TOKEN` is valid |
| **403** | Insufficient permissions | Verify API key has required scopes/permissions |
| **429** | Rate limit exceeded | Automatic retry with backoff (wait 1s → 2s → 4s → 8s) |
| **5xx** | Server error | Auto-retry enabled; contact API provider if persists |
| **Timeout** | Network/endpoint latency | Check network connection, increase `timeout_seconds` |
| **Connection** | DNS/network failure | Verify endpoint URL and internet connection |

**Example Diagnostic Output:**
```
❌ Test Failed: get_user_profile
Status: 401 Unauthorized
Diagnosis: Authentication token is missing or invalid
Suggestion: Check your .env file and ensure API_TOKEN is set correctly
```

### Retry Logic

- **Smart Retry**: Automatically retries `429` (rate limit) and `5xx` (server errors)
- **Exponential Backoff**: 1s → 2s → 4s → 8s between retries
- **Configurable**: Set `retries: 5` in your test suite YAML
- **Selective**: Doesn't retry on 4xx client errors (except 429)

**Retry Flow:**
```
Request → 429 Rate Limited → Wait 1s → Retry
       → 503 Server Error → Wait 2s → Retry
       → 500 Server Error → Wait 4s → Retry
       → 200 Success ✓
```

### Logging

All requests are comprehensively logged:

**Captured Data:**
- 🕐 Timestamp
- 🔗 Method and URL
- 📝 Request headers and body
- ✅ Response status code
- ⏱️ Response time (latency)
- 📦 Response size
- ❌ Error details and stack traces

**Log Location:** `logs/<timestamp>.log`

**Example Log Entry:**
```log
[2026-01-19 14:30:45] INFO - Request: GET https://api.plivo.com/v1/Account/
[2026-01-19 14:30:45] INFO - Auth: Bearer Token
[2026-01-19 14:30:45] INFO - Response: 200 OK (245ms, 1.2KB)
[2026-01-19 14:30:45] INFO - Success ✓
```

### Reports

Generated after each test suite run:

**HTML Report** (`reports/report_<timestamp>.html`)
- Visual dashboard with color-coded results
- Test summary with pass/fail counts
- Detailed diagnostics for each test
- Troubleshooting suggestions
- Charts and metrics

**JSON Report** (`reports/report_<timestamp>.json`)
- Machine-readable format
- Structured test results
- Integration with CI/CD pipelines
- Easy parsing for automation

**Report Contents:**
```json
{
  "summary": {
    "total_tests": 10,
    "passed": 8,
    "failed": 2,
    "success_rate": 80,
    "avg_response_time": 245
  },
  "tests": [...],
  "diagnostics": [...]
}
```

---

## 🛠️ Tech Stack

**Backend:**
- **Python 3.11+** - Modern Python with type hints
- **FastAPI** - High-performance async API framework
- **requests** - Industry-standard HTTP client
- **pyyaml** - YAML parsing for test suite configuration
- **rich** - Beautiful terminal UI with colors and progress bars
- **jinja2** - HTML report templating
- **uvicorn** - ASGI server for FastAPI

**Frontend:**
- **React 19** - Latest React with hooks
- **TypeScript 5.9** - Type-safe development
- **Vite 7** - Lightning-fast build tool
- **Tailwind CSS 3** - Utility-first CSS framework
- **Zustand** - Lightweight state management
- **Recharts** - Composable charting library
- **Axios** - Promise-based HTTP client

**DevOps:**
- **Docker** - Containerized deployment
- **Nginx** - Production reverse proxy
- **Render** - Cloud deployment platform

---

## 📁 Project Structure

```
api-watch/
├─ src/
│  ├─ __init__.py            # Package init with exports
│  ├─ main.py                # CLI entry point with argparse
│  ├─ api_server.py          # FastAPI backend for React frontend
│  ├─ runner.py              # API request executor with retry logic
│  ├─ auth.py                # Authentication handlers (Bearer, API Key, Basic)
│  ├─ retry.py               # Retry logic with exponential backoff
│  ├─ diagnose.py            # Error diagnosis engine
│  ├─ report.py              # HTML/JSON report generation
│  ├─ utils.py               # Utility functions
│  └─ webhook_server.py      # FastAPI webhook receiver
├─ frontend/
│  ├─ src/
│  │  ├─ components/         # Layout, Header, Sidebar
│  │  ├─ pages/              # Dashboard, SingleRequest, TestSuites, etc.
│  │  ├─ lib/                # API client, utilities
│  │  ├─ store/              # Zustand state management
│  │  └─ types/              # TypeScript interfaces
│  ├─ package.json
│  ├─ tailwind.config.js
│  └─ vite.config.ts
├─ examples/
│  ├─ test_suite.yaml              # Sample test suite
│  ├─ customer_onboarding_suite.yaml
│  ├─ env.sample                   # Environment variables template
│  └─ sample_payload.json          # Sample request payload
├─ tests/                    # Test directory
├─ Dockerfile.backend        # Backend Docker image
├─ Dockerfile.frontend       # Frontend Docker image
├─ docker-compose.yml        # Full stack Docker setup
├─ nginx.conf                # Production Nginx config
├─ render.yaml               # Render.com deployment config
├─ README.md
├─ requirements.txt
└─ LICENSE
```

---

## 🚀 Deployment (Production-Ready)

API-Watch consists of two components:
1. **CLI Tool** - Runs locally on your laptop/server
2. **Webhook Server** - FastAPI server that can be deployed publicly

### Deploy Webhook Server on Render (Free)

**Why Deploy?**
- Get a public HTTPS endpoint for webhook testing
- Test customer webhook integrations remotely
- Share webhook testing capabilities with your team

**Step 1: Prepare Repository**

The repository already includes `render.yaml` configuration:

```yaml
services:
  - type: web
    name: api-watch-webhook
    env: python
    plan: free
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn src.webhook_server:app --host 0.0.0.0 --port 10000
```

**Step 2: Deploy to Render**

1. **Sign up** at [render.com](https://render.com)
2. **Connect GitHub** - Link your API-Watch repository
3. **Create Web Service**:
   - Select "New Web Service"
   - Choose your API-Watch repository
   - Render will auto-detect `render.yaml`
4. **Deploy** - Click "Create Web Service"

**Step 3: Get Your Webhook URL**

After deployment (takes 2-3 minutes), you'll receive:
```
https://api-watch-webhook.onrender.com
```

Your webhook endpoint:
```
https://api-watch-webhook.onrender.com/webhook
```

**Step 4: Test Your Deployed Webhook**

```bash
# Test from anywhere
curl -X POST https://api-watch-webhook.onrender.com/webhook \
  -H "Content-Type: application/json" \
  -d '{"event": "test", "status": "success"}'
```

**Resume Impact:**
> "Deployed production webhook testing server on Render with public HTTPS endpoint for customer integration validation."

---

### Deploy Reports to Cloudflare Pages (Free)

Host your generated HTML reports publicly for easy sharing.

**Step 1: Generate Sample Report**

```bash
# Run test suite to generate report
python src/main.py suite --file examples/customer_onboarding_suite.yaml

# Copy latest report to public folder
cp reports/report_latest.html public/report.html
```

**Step 2: Deploy to Cloudflare Pages**

1. Sign up at [pages.cloudflare.com](https://pages.cloudflare.com)
2. Connect your GitHub repository
3. Configure build:
   - **Build command**: (leave empty)
   - **Build output directory**: `public`
4. Deploy

**Your Reports URL:**
```
https://api-watch.pages.dev
```

**Benefits:**
- Share test reports with customers instantly
- Professional-looking hosted documentation
- Free CDN with HTTPS
- Zero configuration required

---

### Alternative Deployment Options

**Railway** (Easy alternative to Render)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy
railway login
railway init
railway up
```

**Fly.io** (Advanced - Docker-based)
```bash
# Install flyctl
# Create Dockerfile (if needed)
fly launch
fly deploy
```

**Docker Deployment**
```bash
# Build image
docker build -t api-watch-webhook .

# Run locally
docker run -p 8080:8080 api-watch-webhook

# Deploy to any cloud provider supporting Docker
```

---

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.


---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.


