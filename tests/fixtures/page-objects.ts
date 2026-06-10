import { Page } from '@playwright/test';

/**
 * Common page object model base class for DRY test code
 */
export class BasePage {
  constructor(protected page: Page) {}

  async goto(path: string) {
    await this.page.goto(path);
    await this.page.waitForLoadState('networkidle').catch(() => {});
  }

  async waitForSelector(selector: string, timeout = 5000) {
    await this.page.waitForSelector(selector, { timeout });
  }

  async click(selector: string) {
    await this.page.click(selector);
  }

  async fill(selector: string, text: string) {
    await this.page.fill(selector, text);
  }

  async getText(selector: string) {
    return await this.page.textContent(selector);
  }

  async getAttribute(selector: string, attr: string) {
    return await this.page.getAttribute(selector, attr);
  }

  async isVisible(selector: string) {
    return await this.page.isVisible(selector);
  }
}

/**
 * Dashboard page object model
 */
export class DashboardPage extends BasePage {
  async navigateToDashboard() {
    await this.goto('/dashboard');
  }

  async getMetricsCount() {
    return await this.page.locator('[data-testid="metric-card"], .metric-card').count();
  }

  async setDateRange(startDate: string, endDate: string) {
    const dateInputs = this.page.locator('input[type="date"]');
    if (await dateInputs.count() > 0) {
      await dateInputs.nth(0).fill(startDate);
      if (await dateInputs.count() > 1) {
        await dateInputs.nth(1).fill(endDate);
      }
      await this.page.waitForLoadState('networkidle').catch(() => {});
    }
  }

  async waitForChartsToLoad() {
    await this.page.waitForSelector('canvas, [role="img"]', { timeout: 10000 });
  }

  async getChartCount() {
    return await this.page.locator('canvas, [role="img"]').count();
  }
}

/**
 * Authentication page object model
 */
export class LoginPage extends BasePage {
  async navigateToLogin() {
    await this.goto('/login');
  }

  async login(email: string, password: string) {
    await this.fill('input[type="email"]', email);
    await this.fill('input[type="password"]', password);
    await this.click('button:has-text("Sign In")');
  }

  async expectErrorMessage() {
    return await this.page.locator('text=/invalid|error/i').isVisible();
  }
}
