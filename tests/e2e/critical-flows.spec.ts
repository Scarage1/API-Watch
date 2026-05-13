/**
 * Playwright E2E tests for API-Watch critical flows.
 *
 * Tests:
 *  1. App loads and renders the dashboard
 *  2. Navigate to request page and send a request
 *  3. History page shows the executed request
 *  4. Health check endpoint responds correctly
 */
import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ── Helpers ──────────────────────────────────────────────────
async function dismissOnboarding(page: Page) {
  // Close onboarding modal if it appears
  const modal = page.getByRole('dialog');
  if (await modal.isVisible({ timeout: 2000 }).catch(() => false)) {
    const closeButton = page.getByRole('button', { name: /close|dismiss|skip|get started/i });
    if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeButton.click();
    }
  }
}

// ── Tests ────────────────────────────────────────────────────
test.describe('API-Watch Critical Flows', () => {

  test('Health check endpoint responds', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/health`);
    expect(response.ok()).toBeTruthy();
    
    const body = await response.json();
    expect(body.status).toMatch(/healthy|degraded/);
    expect(body.service).toBe('API-Watch');
    expect(body.checks).toHaveProperty('database');
    expect(body.checks).toHaveProperty('cache');
  });

  test('Metrics endpoint returns Prometheus format', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/metrics`);
    expect(response.ok()).toBeTruthy();
    
    const text = await response.text();
    expect(text).toContain('apiwatch_uptime_seconds');
    expect(text).toContain('apiwatch_http_requests_total');
    expect(text).toContain('apiwatch_active_connections');
  });

  test('Dashboard loads successfully', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await dismissOnboarding(page);
    
    // Dashboard should show stat cards
    await expect(page.getByText(/total requests/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/success rate/i)).toBeVisible();
  });

  test('Navigate to request page', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await dismissOnboarding(page);

    // Click on "HTTP Client" or "Request" in sidebar
    const httpLink = page.getByRole('link', { name: /http|request/i }).first();
    await httpLink.click();

    // URL input should be visible
    await expect(page.getByPlaceholder(/api\.example\.com|enter.*url/i)).toBeVisible({ timeout: 5000 });
  });

  test('Execute a request end-to-end', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/request`);
    await dismissOnboarding(page);

    // Type a URL
    const urlInput = page.getByPlaceholder(/api\.example\.com|enter.*url/i);
    await urlInput.fill('https://jsonplaceholder.typicode.com/posts/1');

    // Click Send
    const sendButton = page.getByRole('button', { name: /send/i });
    await sendButton.click();

    // Wait for response to appear
    await expect(page.getByText(/200/)).toBeVisible({ timeout: 15000 });
  });

  test('Navigation between pages works', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await dismissOnboarding(page);

    // Navigate to History
    const historyLink = page.getByRole('link', { name: /history/i }).first();
    if (await historyLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await historyLink.click();
      await page.waitForURL('**/history', { timeout: 5000 });
    }

    // Navigate to Analytics
    const analyticsLink = page.getByRole('link', { name: /analytics/i }).first();
    if (await analyticsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyticsLink.click();
      await page.waitForURL('**/analytics', { timeout: 5000 });
    }
  });

  test('404 page renders for unknown routes', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/nonexistent-page-xyz`);
    
    await expect(page.getByText(/404|not found|page.*exist/i)).toBeVisible({ timeout: 5000 });
  });
});

// ── Performance benchmarks ───────────────────────────────────
test.describe('Performance Benchmarks', () => {

  test('Page load under 3 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto(FRONTEND_URL, { waitUntil: 'networkidle' });
    const loadTime = Date.now() - start;
    
    console.log(`📊 Page load time: ${loadTime}ms`);
    expect(loadTime).toBeLessThan(3000);
  });

  test('Navigation completes under 500ms', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await dismissOnboarding(page);
    
    const httpLink = page.getByRole('link', { name: /http|request/i }).first();
    
    if (await httpLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      const start = Date.now();
      await httpLink.click();
      await page.getByPlaceholder(/api\.example\.com|enter.*url/i).waitFor({ timeout: 5000 });
      const navTime = Date.now() - start;
      
      console.log(`📊 Navigation time: ${navTime}ms`);
      expect(navTime).toBeLessThan(500);
    }
  });
});
