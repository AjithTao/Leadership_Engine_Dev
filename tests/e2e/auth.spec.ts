import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load login page', async ({ page }) => {
    // Adjust selectors based on your actual UI
    const loginElement = page.locator('input[type="email"]').first();
    await expect(loginElement).toBeVisible();
  });

  test('should display error on invalid credentials', async ({ page }) => {
    // Adjust selectors and endpoints based on your implementation
    await page.fill('input[type="email"]', 'invalid@test.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button:has-text("Sign In")');
    
    // Wait for error message
    const errorMessage = page.locator('text=/invalid|error/i');
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to dashboard on successful login', async ({ page, context }) => {
    // Mock authentication - in real tests you'd use valid credentials or test accounts
    // Set auth cookie or token
    await context.addCookies([
      {
        name: 'auth_token',
        value: 'test_token_12345',
        url: 'http://localhost:3001',
        expires: Math.floor(Date.now() / 1000) + 3600,
      },
    ]);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/.*dashboard/);
  });

  test('should logout successfully', async ({ page, context }) => {
    // Set auth cookie
    await context.addCookies([
      {
        name: 'auth_token',
        value: 'test_token_12345',
        url: 'http://localhost:3001',
        expires: Math.floor(Date.now() / 1000) + 3600,
      },
    ]);

    await page.goto('/dashboard');
    
    // Find and click logout button
    const logoutButton = page.locator('button:has-text("Logout")');
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
      await expect(page).toHaveURL(/.*login|auth/i);
    }
  });
});
