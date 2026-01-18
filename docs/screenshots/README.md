# Screenshots

This folder contains screenshots for documentation purposes.

## Required Screenshots

### 1. terminal-output.png
Screenshot showing:
- API-Watch CLI execution
- Color-coded test results
- Progress indicators
- Success/failure status

### 2. html-report.png
Screenshot showing:
- Generated HTML report dashboard
- Test results summary
- Diagnostics and troubleshooting
- Response time metrics

## How to Add Screenshots

1. Run API-Watch and capture terminal output:
   ```bash
   python src/main.py suite --file examples/customer_onboarding_suite.yaml
   ```

2. Open generated HTML report in browser and take screenshot:
   ```bash
   # Report location: reports/report_<timestamp>.html
   ```

3. Save screenshots with these names:
   - `terminal-output.png`
   - `html-report.png`

4. Place them in this directory (`docs/screenshots/`)

## Tips for Great Screenshots

- Use high resolution (at least 1920x1080)
- Show complete terminal output with colors
- Capture entire browser window for HTML report
- Use professional terminal themes (dark mode recommended)
- Ensure text is readable and clear
