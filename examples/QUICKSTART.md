# Quick Start Guide

## 🚀 Getting Started in 5 Minutes

### 1. Setup

```bash
# Navigate to project directory
cd api-debug-toolkit

# Create and activate virtual environment
python -m venv venv

# Windows:
venv\Scripts\activate

# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
# Copy environment template
copy examples\env.sample .env

# Edit .env and add your API credentials
notepad .env
```

### 3. Run Your First Test

#### Option A: Single Request

```bash
python src/main.py request ^
  --method GET ^
  --url https://jsonplaceholder.typicode.com/posts/1 ^
  --verbose
```

#### Option B: Test Suite

```bash
python src/main.py suite --file examples/test_suite.yaml
```

### 4. Start Webhook Server

```bash
python src/webhook_server.py --port 8080
```

---

## 📚 Common Use Cases

### Test REST API with Bearer Token

```bash
python src/main.py request ^
  --method GET ^
  --url https://api.github.com/user ^
  --bearer YOUR_GITHUB_TOKEN
```

### POST Request with JSON Body

```bash
python src/main.py request ^
  --method POST ^
  --url https://api.example.com/tickets ^
  --bearer YOUR_TOKEN ^
  --body "{\"title\": \"Test\", \"priority\": \"high\"}"
```

### API Key Authentication

```bash
python src/main.py request ^
  --method GET ^
  --url https://api.example.com/data ^
  --api-key YOUR_API_KEY ^
  --api-key-header "X-API-Key"
```

### Custom Headers and Query Parameters

```bash
python src/main.py request ^
  --method GET ^
  --url https://api.example.com/search ^
  --headers "{\"X-Custom-Header\": \"value\"}" ^
  --params "{\"q\": \"search term\", \"limit\": 10}"
```

---

## 📊 Understanding Reports

After running a test suite, reports are generated in the `reports/` directory:

- **HTML Report** (`report_YYYYMMDD_HHMMSS.html`) - Visual dashboard
- **JSON Report** (`report_YYYYMMDD_HHMMSS.json`) - Machine-readable data

### HTML Report Features

- ✅ Summary dashboard with success/failure counts
- 📊 Average response times and success rates
- 🔍 Automatic diagnosis for failures
- 💡 Actionable troubleshooting suggestions
- 📋 Detailed request/response logs

---

## 🧪 Testing Popular APIs

### GitHub API

```bash
# Get authenticated user
python src/main.py request ^
  --method GET ^
  --url https://api.github.com/user ^
  --bearer YOUR_GITHUB_TOKEN

# List repositories
python src/main.py request ^
  --method GET ^
  --url https://api.github.com/user/repos ^
  --bearer YOUR_GITHUB_TOKEN
```

### JSONPlaceholder (Free Test API)

```bash
# Get all posts
python src/main.py request ^
  --method GET ^
  --url https://jsonplaceholder.typicode.com/posts

# Create a post
python src/main.py request ^
  --method POST ^
  --url https://jsonplaceholder.typicode.com/posts ^
  --body "{\"title\": \"Test\", \"body\": \"Content\", \"userId\": 1}"
```

---

## 🐛 Troubleshooting

### Issue: "Module not found" errors

**Solution:** Ensure you're in the virtual environment and all dependencies are installed:

```bash
venv\Scripts\activate
pip install -r requirements.txt
```

### Issue: Authentication failures (401)

**Solution:** 
1. Verify your token/API key is correct
2. Check if token is expired
3. Ensure token has required permissions
4. Verify Authorization header format

### Issue: Connection errors

**Solution:**
1. Check internet connectivity
2. Verify the API URL is correct
3. Check if firewall is blocking requests
4. Try increasing timeout: `--timeout 30`

### Issue: Rate limiting (429)

**Solution:** The toolkit automatically retries with exponential backoff. If still occurring:
1. Wait before sending more requests
2. Check rate limit headers in response
3. Consider upgrading API plan

---

## 💡 Pro Tips

1. **Use Environment Variables:** Store sensitive tokens in `.env` file instead of command line
2. **Verbose Mode:** Add `--verbose` flag to see detailed logs
3. **Test Suite Organization:** Group related tests in separate YAML files
4. **Webhook Testing:** Use the webhook server to test webhook integrations locally
5. **Report Analysis:** Review HTML reports to identify patterns in failures

---

## 📖 Next Steps

- Customize `examples/test_suite.yaml` for your API
- Add more test cases for complete coverage
- Integrate with CI/CD pipeline
- Schedule regular smoke tests
- Share reports with team

---

## 🆘 Need Help?

- Check [README.md](../README.md) for full documentation
- Review example files in `examples/` directory
- Check logs in `logs/` directory
- Open an issue on GitHub

---

**Happy Testing! 🚀**
