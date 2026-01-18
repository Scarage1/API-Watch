# Architecture & Design Documentation

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                           │
│                                                                  │
│  ┌──────────────┐              ┌─────────────────────────────┐ │
│  │   CLI Tool   │              │   Webhook Server (FastAPI)   │ │
│  │   (main.py)  │              │   (webhook_server.py)        │ │
│  └──────┬───────┘              └──────────────┬──────────────┘ │
│         │                                     │                 │
└─────────┼─────────────────────────────────────┼────────────────┘
          │                                     │
          ▼                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                       CORE MODULES                               │
│                                                                  │
│  ┌────────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
│  │  runner.py │  │ auth.py  │  │retry.py  │  │ diagnose.py  │ │
│  │            │  │          │  │          │  │              │ │
│  │ API Exec   │  │  Auth    │  │ Retry    │  │  Error       │ │
│  │ Engine     │  │ Handler  │  │ Logic    │  │  Diagnosis   │ │
│  └─────┬──────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘ │
│        │              │             │                │          │
└────────┼──────────────┼─────────────┼────────────────┼─────────┘
         │              │             │                │
         ▼              ▼             ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SUPPORT MODULES                               │
│                                                                  │
│  ┌────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │ utils.py   │  │   report.py      │  │  Logging System   │   │
│  │            │  │                  │  │                   │   │
│  │ Utilities  │  │ HTML/JSON        │  │  Request/Response │   │
│  │ Helpers    │  │ Report Gen       │  │  Logs             │   │
│  └────────────┘  └──────────────────┘  └──────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
         │              │                      │
         ▼              ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                      OUTPUT & STORAGE                            │
│                                                                  │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │   logs/    │  │   reports/   │  │  Webhook Logs         │   │
│  │            │  │              │  │                       │   │
│  │ .log files │  │ .html + .json│  │  JSON payloads        │   │
│  └────────────┘  └──────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Request Flow Diagram

```
User Command
    │
    ▼
┌─────────────────┐
│  Parse Args     │  main.py
│  Setup Config   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Load Auth      │  auth.py
│  Configure      │  Creates AuthHandler
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Create Runner  │  runner.py
│  Setup Retry    │  Initializes APIRunner
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Execute        │
│  Request        │  ◄──── Retry Loop ────┐
└────────┬────────┘                       │
         │                                │
         ▼                                │
    ┌────────┐                            │
    │Success?│── No ─► Should Retry? ────┘
    └───┬────┘              │
        │                   │
       Yes                 No
        │                   │
        ▼                   ▼
┌──────────────┐    ┌────────────────┐
│ Log Success  │    │  Diagnose      │  diagnose.py
│              │    │  Error         │  Analyzes failure
└──────┬───────┘    └────────┬───────┘
       │                     │
       └──────────┬──────────┘
                  │
                  ▼
         ┌─────────────────┐
         │  Generate       │  report.py
         │  Report         │  HTML + JSON
         └─────────────────┘
```

---

## Data Flow

### Single Request Flow

```
1. Input
   ├─ URL
   ├─ Method (GET/POST/PUT/DELETE)
   ├─ Headers
   ├─ Body
   └─ Auth credentials

2. Processing
   ├─ Add authentication headers
   ├─ Execute HTTP request
   ├─ Measure response time
   └─ Handle errors/retries

3. Output
   ├─ RequestResult object
   │  ├─ success: bool
   │  ├─ status_code: int
   │  ├─ response_time: float
   │  ├─ response_body: str
   │  └─ error: str
   ├─ Log entry
   └─ Terminal display
```

### Test Suite Flow

```
1. Input: YAML file
   ├─ Test definitions
   ├─ Base URL
   ├─ Auth config
   └─ Default settings

2. Processing
   ├─ Parse YAML
   ├─ For each test:
   │  ├─ Build request
   │  ├─ Execute with retries
   │  └─ Collect result
   └─ Aggregate results

3. Output
   ├─ List of RequestResult objects
   ├─ Summary statistics
   ├─ HTML report
   ├─ JSON report
   └─ Terminal summary
```

---

## Module Responsibilities

### main.py (CLI Interface)
**Purpose:** Entry point for CLI commands  
**Responsibilities:**
- Parse command-line arguments
- Setup logging
- Coordinate single request execution
- Coordinate test suite execution
- Display results in terminal

**Key Functions:**
- `execute_single_request()` - Run one API call
- `execute_test_suite()` - Run YAML test suite
- `display_single_result()` - Show request result
- `display_suite_summary()` - Show test suite summary

---

### runner.py (Request Execution)
**Purpose:** Core API request executor  
**Responsibilities:**
- Execute HTTP requests
- Handle timeouts and errors
- Integrate with auth and retry modules
- Measure response times
- Log request/response details

**Key Classes:**
- `RequestConfig` - Request configuration
- `RequestResult` - Response data
- `APIRunner` - Main executor

**Key Methods:**
- `execute()` - Run request with retry
- `_execute_single_request()` - Single attempt
- `_log_request()` - Log details

---

### auth.py (Authentication)
**Purpose:** Handle API authentication  
**Responsibilities:**
- Support multiple auth types
- Load credentials from env
- Generate auth headers
- Validate auth config

**Supported Methods:**
- Bearer Token (Authorization: Bearer <token>)
- API Key (X-API-Key: <key>)
- Basic Auth (username:password)

**Key Class:**
- `AuthHandler` - Main auth manager

---

### retry.py (Retry Logic)
**Purpose:** Smart retry with backoff  
**Responsibilities:**
- Determine if request should retry
- Calculate backoff delays
- Track retry attempts
- Handle exponential backoff

**Key Classes:**
- `RetryConfig` - Configuration
- `RetryHandler` - Retry manager

**Algorithm:**
```python
delay = initial_delay * (2 ** attempt)
delay = min(delay, max_delay)
```

**Retry Conditions:**
- Status: 429, 500, 502, 503, 504
- Exceptions: ConnectionError, Timeout

---

### diagnose.py (Error Diagnosis)
**Purpose:** Analyze failures and suggest fixes  
**Responsibilities:**
- Map status codes to issues
- Provide root cause analysis
- Suggest actionable fixes
- Categorize by severity

**Diagnosis Structure:**
```python
@dataclass
class Diagnosis:
    issue: str          # What happened
    cause: str          # Why it happened
    suggestion: str     # How to fix
    severity: str       # critical/high/medium/low
    category: str       # auth/network/server/client
```

**Supported Status Codes:**
- 400, 401, 403, 404, 405, 422
- 429, 500, 502, 503, 504
- Timeout, Connection errors

---

### report.py (Report Generation)
**Purpose:** Generate visual and JSON reports  
**Responsibilities:**
- Create HTML dashboard
- Generate JSON data
- Calculate statistics
- Format results

**HTML Report Includes:**
- Summary dashboard
- Success/failure metrics
- Average response times
- Detailed test results
- Error diagnoses
- Request/response data

**JSON Report Structure:**
```json
{
  "metadata": {
    "generated_at": "timestamp",
    "test_suite_name": "name"
  },
  "summary": {
    "total_requests": 10,
    "successful": 8,
    "failed": 2,
    "success_rate": 80.0
  },
  "results": [...]
}
```

---

### utils.py (Utilities)
**Purpose:** Helper functions  
**Responsibilities:**
- Environment variable loading
- Directory management
- Timestamp generation
- String formatting
- JSON parsing

**Key Functions:**
- `load_env()` - Load .env file
- `get_env_var()` - Get environment variable
- `ensure_directory()` - Create directory
- `get_timestamp()` - Filename-safe timestamp
- `format_bytes()` - Human-readable sizes
- `format_duration()` - Human-readable times

---

### webhook_server.py (Webhook Receiver)
**Purpose:** Local webhook testing server  
**Responsibilities:**
- Receive HTTP requests
- Parse JSON payloads
- Log to files
- Display in terminal

**Technology:** FastAPI + Uvicorn

**Endpoints:**
- `GET /` - Server info
- `GET /health` - Health check
- `ANY /{path}` - Catch-all webhook receiver

---

## Design Patterns Used

### 1. Separation of Concerns
Each module has a single, well-defined responsibility:
- `runner.py` - Execute requests
- `auth.py` - Handle authentication
- `retry.py` - Manage retries
- `diagnose.py` - Analyze errors
- `report.py` - Generate reports

### 2. Dependency Injection
```python
runner = APIRunner(
    auth_handler=auth_handler,    # Inject auth
    retry_config=retry_config,     # Inject retry
    logger=logger                  # Inject logger
)
```

### 3. Configuration Objects
```python
@dataclass
class RequestConfig:
    method: str
    url: str
    headers: Dict[str, str]
    # ... more fields
```

### 4. Factory Pattern
```python
def create_auth_from_config(config: Dict) -> AuthHandler:
    """Create auth handler from config"""
    # Factory logic
```

### 5. Strategy Pattern
Different auth strategies:
- Bearer token strategy
- API key strategy
- Basic auth strategy

---

## Error Handling Strategy

### Levels of Error Handling

**1. Network Level** (runner.py)
- Catch: `ConnectionError`, `Timeout`, `RequestException`
- Action: Log error, set error_type, allow retry

**2. HTTP Level** (runner.py)
- Check: Response status code
- Action: Mark success/failure, allow retry on 429/5xx

**3. Diagnosis Level** (diagnose.py)
- Analyze: Error type and status code
- Action: Provide human-readable explanation

**4. User Level** (main.py)
- Display: Clear error message
- Action: Show diagnosis with suggestions

### Retry Decision Tree

```
Request Failed
    │
    ▼
┌─────────────────┐
│ Retry Count <   │
│ Max Retries?    │
└────┬────────────┘
     │
    Yes
     │
     ▼
┌─────────────────┐
│ Status Code     │
│ 429 or 5xx?     │──── Yes ──► RETRY
└────┬────────────┘
     │
    No
     │
     ▼
┌─────────────────┐
│ Connection or   │
│ Timeout Error?  │──── Yes ──► RETRY
└────┬────────────┘
     │
    No
     │
     ▼
  FAIL (No Retry)
```

---

## Configuration Management

### Environment Variables (.env)
```env
BASE_URL=https://api.example.com
API_TOKEN=your_token
API_KEY=your_key
DEFAULT_TIMEOUT=10
MAX_RETRIES=3
```

### YAML Test Suite (test_suite.yaml)
```yaml
name: "Test Suite Name"
base_url: "https://api.example.com"

defaults:
  headers: {...}
  timeout_seconds: 10
  retries: 3

auth:
  type: bearer
  token_env: API_TOKEN

tests:
  - id: test_1
    method: GET
    path: /endpoint
```

### Command Line Arguments
```bash
python src/main.py request \
  --method GET \
  --url https://api.example.com \
  --bearer TOKEN \
  --timeout 30 \
  --retries 5
```

**Priority:** CLI args > YAML config > .env defaults

---

## Extension Points

### Add New Authentication Method

1. Update `auth.py`:
```python
def set_custom_auth(self, credentials):
    self.auth_type = "custom"
    self.credentials = credentials

def get_auth_headers(self):
    if self.auth_type == "custom":
        return {"X-Custom-Auth": self.credentials}
```

2. Update `main.py` to accept new CLI arg

### Add New Diagnosis Rule

1. Update `diagnose.py`:
```python
DIAGNOSIS_RULES = {
    # Add new status code
    418: Diagnosis(
        issue="I'm a teapot",
        cause="Server refuses to brew coffee",
        suggestion="Use a coffee machine",
        severity="low",
        category="joke"
    )
}
```

### Add New Report Format

1. Update `report.py`:
```python
def _generate_pdf(self, results, summary):
    # PDF generation logic
    pass
```

---

## Performance Considerations

### Request Execution
- Uses `requests.Session()` for connection pooling
- Configurable timeouts prevent hanging
- Retry logic prevents cascade failures

### Report Generation
- Templates compiled once
- JSON reports for large datasets
- HTML reports optimized for readability

### Logging
- Asynchronous file writes (via logging module)
- Configurable log levels
- Automatic log rotation (if needed)

---

## Security Best Practices

✅ **Never hardcode credentials** - Use environment variables  
✅ **Don't log sensitive data** - Exclude auth headers from logs  
✅ **Validate SSL certificates** - `verify_ssl=True` by default  
✅ **Use .gitignore** - Exclude .env, logs, reports  
✅ **Secure token storage** - Environment variables or secret managers  

---

## Testing Strategy

### Unit Tests (tests/)
```python
# test_auth.py
def test_bearer_token_auth():
    auth = AuthHandler()
    auth.set_bearer_token(token="test_token")
    headers = auth.get_auth_headers()
    assert headers["Authorization"] == "Bearer test_token"

# test_retry.py
def test_exponential_backoff():
    handler = RetryHandler()
    delays = [handler.get_delay() for _ in range(3)]
    assert delays == [1.0, 2.0, 4.0]
```

### Integration Tests
```python
# test_integration.py
def test_full_request_flow():
    runner = APIRunner()
    config = RequestConfig(...)
    result = runner.execute(config)
    assert result.success
```

### End-to-End Tests
```bash
# Run actual API tests
python src/main.py request --url https://jsonplaceholder.typicode.com/posts/1
python src/main.py suite --file examples/test_suite.yaml
```

---

## Deployment Options

### Local Development
```bash
python src/main.py request --url <endpoint>
```

### Docker Container
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY src/ src/
ENTRYPOINT ["python", "src/main.py"]
```

Run:
```bash
docker build -t api-debug-toolkit .
docker run api-debug-toolkit request --url https://api.example.com
```

### CI/CD Integration (GitHub Actions)
```yaml
name: API Tests
on: [push, schedule]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Setup Python
        uses: actions/setup-python@v2
      - name: Install dependencies
        run: pip install -r requirements.txt
      - name: Run tests
        run: python src/main.py suite --file tests/smoke_tests.yaml
```

---

## Future Enhancements

### Phase 2 (Nice to Have)
- OAuth2 support with token refresh
- Performance testing (concurrent requests)
- Database logging (SQLite)
- API mocking server
- GraphQL support

### Phase 3 (Advanced)
- WebSocket testing
- gRPC support
- Distributed tracing
- Real-time monitoring dashboard
- Slack/email notifications

---

This architecture is designed for:
✅ **Modularity** - Easy to extend and modify  
✅ **Testability** - Clear separation for unit testing  
✅ **Maintainability** - Well-documented and organized  
✅ **Scalability** - Can handle complex scenarios  
✅ **Production-readiness** - Error handling, logging, reporting  
