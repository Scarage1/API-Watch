# API-Watch Screenshot Placeholders

This file serves as a placeholder until actual screenshots are captured.

## How to Generate Screenshots

### Terminal Output Screenshot

1. Run the test suite:
```bash
python src/main.py suite --file examples/customer_onboarding_suite.yaml
```

2. Take a screenshot of your terminal showing:
   - Colorful test execution
   - Progress indicators
   - Pass/fail results
   - Summary statistics

3. Save as: `terminal-output.png`

### HTML Report Screenshot

1. Open generated report in browser:
```bash
# Find the latest report
cd reports
# Open report_<timestamp>.html in your browser
```

2. Take a screenshot showing:
   - Full dashboard view
   - Test results table
   - Diagnostics section
   - Charts/metrics if any

3. Save as: `html-report.png`

## Recommended Tools

- **Windows**: Snipping Tool, Greenshot, ShareX
- **Mac**: Cmd+Shift+4, Cleanshot X
- **Linux**: Flameshot, GNOME Screenshot

## Image Specifications

- Format: PNG (best quality)
- Min Resolution: 1920x1080
- Max File Size: 2MB
- Background: Dark terminal theme recommended

## After Creating Screenshots

1. Place them in this directory (`docs/screenshots/`)
2. Verify they display in README:
   - Terminal output shows at "Example Output" section
   - HTML report shows below terminal output
3. Commit and push:
   ```bash
   git add docs/screenshots/*.png
   git commit -m "Add project screenshots"
   git push
   ```

## Alternative: Use These Free Screenshot Services

If you want professional-looking screenshots:

- [Carbon](https://carbon.now.sh) - Beautiful code screenshots
- [Ray.so](https://ray.so) - Terminal screenshots with themes
- [Screely](https://screely.com) - Add browser mockups
