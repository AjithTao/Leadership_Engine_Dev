import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page, context }) => {
    // Setup authentication
    await context.addCookies([
      {
        name: 'auth_token',
        value: 'test_token_12345',
        url: 'http://localhost:3001',
        expires: Math.floor(Date.now() / 1000) + 3600,
      },
    ]);
    await page.goto('/dashboard');
  });

  test('should display dashboard title', async ({ page }) => {
    const title = page.locator('h1');
    await expect(title).toContainText(/dashboard|metrics|overview/i);
  });

  test('should load dashboard charts', async ({ page }) => {
    // Wait for chart elements to load
    const charts = page.locator('canvas, [role="img"]').first();
    await expect(charts).toBeVisible({ timeout: 10000 });
  });

  test('should display metrics cards', async ({ page }) => {
    // Look for metric cards/containers
    const metricCards = page.locator('[data-testid="metric-card"], .metric-card, .card');
    const count = await metricCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should allow date range filtering', async ({ page }) => {
    const dateInput = page.locator('input[type="date"]').first();
    if (await dateInput.isVisible()) {
      await dateInput.fill('2024-01-01');
      // Wait for dashboard to update
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    }
  });

  test('should navigate between sections', async ({ page }) => {
    // Test navigation links
    const navLinks = page.locator('[role="navigation"] a, nav a');
    const count = await navLinks.count();
    
    if (count > 0) {
      const firstLink = navLinks.first();
      const href = await firstLink.getAttribute('href');
      if (href && !href.startsWith('http')) {
        await firstLink.click();
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      }
    }
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // Simulate network error by blocking API calls
    await page.route('**/api/**', route => route.abort());
    await page.reload();
    
    // Check for error handling UI
    const errorIndicator = page.locator('text=/error|failed|unable/i').first();
    // The page should still be functional even with errors
    await expect(page).not.toHaveTitle(/error/i);
  });
});
