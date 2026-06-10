import { Page, BrowserContext } from '@playwright/test';

/**
 * Setup authentication for tests
 * Can be extended to support multiple authentication methods
 */
export async function setupAuth(page: Page, context: BrowserContext) {
  // Add auth token cookie
  await context.addCookies([
    {
      name: 'auth_token',
      value: process.env.TEST_AUTH_TOKEN || 'test_token_12345',
      url: 'http://localhost:3001',
      expires: Math.floor(Date.now() / 1000) + 3600,
    },
  ]);

  // Optionally store auth data in localStorage
  await page.goto('http://localhost:3001');
  await page.evaluate(() => {
    localStorage.setItem('auth_token', process.env.TEST_AUTH_TOKEN || 'test_token_12345');
    localStorage.setItem('user_id', 'test-user-123');
  });
}

/**
 * Clear authentication
 */
export async function clearAuth(context: BrowserContext) {
  await context.clearCookies();
}

/**
 * Login with credentials
 */
export async function login(
  page: Page,
  email: string,
  password: string
) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button:has-text("Sign In")');
  
  // Wait for navigation to dashboard
  await page.waitForURL(/.*dashboard/, { timeout: 10000 });
}

/**
 * Logout
 */
export async function logout(page: Page) {
  const logoutButton = page.locator('button:has-text("Logout"), [data-testid="logout-btn"]');
  if (await logoutButton.isVisible()) {
    await logoutButton.click();
  }
}
