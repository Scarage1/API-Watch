# Usage Examples for API Debugging Toolkit

This file contains practical examples for using the toolkit.

## Example 1: Simple GET Request

```bash
python src/main.py request \
  --method GET \
  --url https://jsonplaceholder.typicode.com/posts/1
```

## Example 2: POST with Bearer Token

```bash
python src/main.py request \
  --method POST \
  --url https://api.example.com/tickets \
  --bearer YOUR_TOKEN_HERE \
  --body '{"title": "API Issue", "priority": "high"}'
```

## Example 3: API Key Authentication

```bash
python src/main.py request \
  --method GET \
  --url https://api.example.com/data \
  --api-key YOUR_API_KEY \
  --api-key-header "X-API-Key"
```

## Example 4: Custom Headers and Query Params

```bash
python src/main.py request \
  --method GET \
  --url https://api.example.com/search \
  --headers '{"X-Custom-Header": "value", "X-Request-ID": "123"}' \
  --params '{"q": "search term", "limit": 10, "offset": 0}'
```

## Example 5: PUT Request with JSON Body

```bash
python src/main.py request \
  --method PUT \
  --url https://api.example.com/users/123 \
  --bearer TOKEN \
  --body '{"name": "John Doe", "email": "john@example.com"}'
```

## Example 6: DELETE Request

```bash
python src/main.py request \
  --method DELETE \
  --url https://api.example.com/resources/456 \
  --bearer TOKEN
```

## Example 7: Request with Custom Timeout and Retries

```bash
python src/main.py request \
  --method GET \
  --url https://slow-api.example.com/data \
  --timeout 30 \
  --retries 5 \
  --verbose
```

## Example 8: Run Test Suite

```bash
python src/main.py suite --file examples/test_suite.yaml
```

## Example 9: Run Test Suite Without Report Generation

```bash
python src/main.py suite --file examples/test_suite.yaml --no-report
```

## Example 10: Verbose Mode for Debugging

```bash
python src/main.py request \
  --method GET \
  --url https://api.example.com/debug \
  --verbose
```

## Example 11: Testing GitHub API

```bash
# Get authenticated user
python src/main.py request \
  --method GET \
  --url https://api.github.com/user \
  --bearer YOUR_GITHUB_TOKEN

# List repositories
python src/main.py request \
  --method GET \
  --url https://api.github.com/user/repos \
  --bearer YOUR_GITHUB_TOKEN \
  --params '{"per_page": 5, "sort": "updated"}'
```

## Example 12: Start Webhook Server

```bash
# Default port (8080)
python src/webhook_server.py

# Custom port
python src/webhook_server.py --port 3000

# With auto-reload for development
python src/webhook_server.py --port 8080 --reload
```

## Example 13: Testing with JSONPlaceholder (Free API)

```bash
# GET request
python src/main.py request \
  --method GET \
  --url https://jsonplaceholder.typicode.com/posts

# POST request
python src/main.py request \
  --method POST \
  --url https://jsonplaceholder.typicode.com/posts \
  --body '{"title": "Test Post", "body": "Test content", "userId": 1}'

# PUT request
python src/main.py request \
  --method PUT \
  --url https://jsonplaceholder.typicode.com/posts/1 \
  --body '{"id": 1, "title": "Updated", "body": "Updated content", "userId": 1}'

# DELETE request
python src/main.py request \
  --method DELETE \
  --url https://jsonplaceholder.typicode.com/posts/1
```

## Example 14: Programmatic Usage (Python Script)

Create a file `test_api.py`:

```python
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from runner import APIRunner, RequestConfig
from auth import AuthHandler
from retry import RetryConfig
from diagnose import DiagnosisEngine
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create auth handler
auth = AuthHandler()
auth.set_bearer_token(token="YOUR_TOKEN")

# Create runner
retry_config = RetryConfig(max_retries=3)
runner = APIRunner(auth, retry_config, logger)

# Execute request
config = RequestConfig(
    method="GET",
    url="https://api.example.com/data",
    timeout=10
)

result = runner.execute(config)

# Check result
if result.success:
    print(f"✓ Success: {result.status_code}")
    print(f"Response: {result.response_body}")
else:
    print(f"✗ Failed: {result.error}")
    diagnosis = DiagnosisEngine.diagnose(result)
    print(f"Diagnosis: {diagnosis.suggestion}")

runner.close()
```

Run it:
```bash
python test_api.py
```

## Example 15: Environment Variables (Recommended)

1. Create `.env` file:
```env
API_TOKEN=your_token_here
BASE_URL=https://api.example.com
```

2. Run commands (token loaded automatically):
```bash
python src/main.py request \
  --method GET \
  --url $BASE_URL/endpoint \
  --bearer $API_TOKEN
```

## Example 16: Create Custom Test Suite

Create `my_tests.yaml`:

```yaml
name: "My Custom Tests"
base_url: "https://api.myservice.com"

defaults:
  headers:
    Content-Type: "application/json"
  timeout_seconds: 15
  retries: 3

auth:
  type: bearer
  token_env: API_TOKEN

tests:
  - id: health
    method: GET
    path: /health

  - id: get_data
    method: GET
    path: /v1/data
    params:
      limit: 100

  - id: create_item
    method: POST
    path: /v1/items
    body:
      name: "Test Item"
      value: 42
```

Run it:
```bash
python src/main.py suite --file my_tests.yaml
```

---

## Pro Tips

1. **Store tokens in .env**: Never commit tokens to git
2. **Use verbose mode**: Add `--verbose` flag when debugging
3. **Increase timeout for slow APIs**: Use `--timeout 30` or higher
4. **Check logs**: Review `logs/` directory for detailed information
5. **Open HTML reports**: Double-click `reports/*.html` files to view in browser
6. **Test locally first**: Use JSONPlaceholder or webhook server for practice

---

## Common Scenarios

### Scenario 1: Debug Customer's 401 Error
```bash
python src/main.py request \
  --method GET \
  --url https://api.customer.com/endpoint \
  --bearer CUSTOMER_TOKEN \
  --verbose
```
Check diagnosis output for token issues.

### Scenario 2: Validate New API Integration
Create test suite with all endpoints and run:
```bash
python src/main.py suite --file customer_onboarding.yaml
```

### Scenario 3: Test Rate Limiting Behavior
```bash
# The toolkit will automatically retry with backoff
python src/main.py request \
  --method GET \
  --url https://api.example.com/limited-endpoint \
  --retries 5
```

### Scenario 4: Monitor API Health
Schedule this to run periodically:
```bash
python src/main.py suite --file health_checks.yaml
```

---

For more information, see README.md and QUICKSTART.md
