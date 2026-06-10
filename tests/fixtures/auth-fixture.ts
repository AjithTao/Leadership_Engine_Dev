import { test as base, expect } from '@playwright/test';
import { setupAuth, clearAuth } from './auth-setup';

type AuthenticatedFixtures = {
  authenticatedPage: void;
};

/**
 * Extended test fixture that includes authentication setup
 */
export const test = base.extend<AuthenticatedFixtures>({
  authenticatedPage: async ({ page, context }, use) => {
    // Setup authentication before each test
    await setupAuth(page, context);
    
    // Use the page in the test
    await use();
    
    // Cleanup after each test
    await clearAuth(context);
  },
});

export { expect };
