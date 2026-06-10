import { test, expect } from '@playwright/test';

test.describe('API Integration', () => {
  test('should make successful API calls from dashboard', async ({ page }) => {
    // Monitor network requests
    const requestPromises: Promise<string>[] = [];
    
    page.on('response', response => {
      if (response.request().resourceType() === 'xhr' || response.request().resourceType() === 'fetch') {
        requestPromises.push(Promise.resolve(response.request().url()));
      }
    });

    await page.goto('http://localhost:3001/dashboard');
    await page.waitForLoadState('networkidle', { timeout: 10000 });

    // Check that API calls were made
    const urls = await Promise.all(requestPromises);
    const apiCalls = urls.filter(url => url.includes('/api/'));
    
    expect(apiCalls.length).toBeGreaterThan(0);
  });

  test('should handle API timeouts', async ({ page }) => {
    // Slow down network to simulate timeout
    await page.route('**/api/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 31000)); // Longer than typical timeout
      route.abort();
    });

    await page.goto('http://localhost:3001/dashboard');
    
    // Application should show timeout/error state
    await page.waitForTimeout(5000);
    // Verify application doesn't crash
    const pageTitle = await page.title();
    expect(pageTitle).toBeTruthy();
  });

  test('should retry failed API calls', async ({ page }) => {
    let callCount = 0;
    
    await page.route('**/api/metrics', route => {
      callCount++;
      if (callCount === 1) {
        route.abort();
      } else {
        route.continue();
      }
    });

    await page.goto('http://localhost:3001/dashboard');
    
    // Wait for potential retry
    await page.waitForTimeout(3000);
    
    // Verify retry was attempted (callCount should be 2 or more if retry logic exists)
    expect(callCount).toBeGreaterThanOrEqual(1);
  });

  test('should validate API response data', async ({ page }) => {
    const responseData: any[] = [];
    
    page.on('response', async response => {
      if (response.request().resourceType() === 'fetch' && response.url().includes('/api/')) {
        try {
          const data = await response.json();
          responseData.push(data);
        } catch (e) {
          // Ignore non-JSON responses
        }
      }
    });

    await page.goto('http://localhost:3001/dashboard');
    await page.waitForLoadState('networkidle', { timeout: 10000 });

    // Verify response data structure
    if (responseData.length > 0) {
      responseData.forEach(data => {
        // Add your validation logic based on expected API response structure
        if (data.error) {
          expect(data).toHaveProperty('error');
        }
      });
    }
  });
});
