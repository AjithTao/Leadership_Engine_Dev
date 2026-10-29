// Run against the production export served on :3100. No real credentials used.
const { chromium, expect } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    let connected = false, connects = 0, expired = false;
    await context.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let data = { success: true }, status = 200;
      if (expired) { status = 401; data = { detail: 'Authentication required' }; }
      else if (path.endsWith('/auth/login')) data = { success: true, token: 'test-session', username: 'tester' };
      else if (path.endsWith('/auth/verify')) data = { success: true, username: 'tester' };
      else if (path.endsWith('/auto-connect-integrations')) {
        connects++; connected = true;
        data = { success: true, results: { jira: { success: true }, confluence: { success: false, message: 'Provider authentication failed' }, github: { success: false, message: 'Not configured' } } };
      } else if (path.endsWith('/jira/status')) data = { configured: connected, credentials_available: true, config: { url: 'https://jira.example.test', email: 'sh***@example.test' } };
      else if (path.endsWith('/confluence/status')) data = { configured: false, credentials_available: true };
      else if (path.endsWith('/github/status')) data = { connected: false, credentials_available: false };
      else if (path.endsWith('/tableau/status')) data = { configured: false };
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto('http://localhost:3100');
    await expect(page.getByPlaceholder('Enter your username')).toBeVisible();
    expect(connects).toBe(0);
    await page.evaluate(() => localStorage.setItem('cdk-digital-settings', JSON.stringify({ userProfile: { name: 'Tester' }, jiraToken: 'obsolete-secret' })));
    await page.reload();
    await page.getByPlaceholder('Enter your username').fill('tester');
    await page.locator('input[type=password]').fill('test-password');
    await page.locator('button[type=submit]').click();
    await expect(page.getByAltText('TAO Digital Solutions')).toBeVisible();
    await expect.poll(() => connects).toBe(1);
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/Project Mercury|About Us|Salesforce|CDK/);
    expect(await page.evaluate(() => localStorage.getItem('cdk-digital-settings'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('tao-digital-settings'))).not.toContain('obsolete-secret');
    await page.getByRole('button', { name: /^(Manage|Connect Integrations)$/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Connection Settings' });
    await expect(dialog.getByRole('status')).toHaveText('Connected');
    await expect(dialog.locator('input')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'confluence', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText('Connection failed');
    await dialog.getByRole('button', { name: 'GitHub', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText('Not configured');
    await dialog.getByRole('button', { name: 'Retry connection' }).click();
    await expect.poll(() => connects).toBe(2);
    await dialog.getByRole('button', { name: 'tableau', exact: true }).click();
    await expect(dialog.getByText('Tableau Integration', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByAltText('TAO Digital Solutions')).toBeVisible();
    // Simulate a backend restart; the restored session must reconnect.
    connected = false;
    const before = connects;
    await page.reload();
    await expect.poll(() => connects).toBeGreaterThan(before);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(t => { localStorage.setItem('falconx-theme', t); }, theme);
      await page.reload();
      const logo = page.getByAltText('TAO Digital Solutions');
      await expect(logo).toBeVisible();
      expect(await logo.evaluate(img => img.complete && img.naturalWidth > 0)).toBeTruthy();
      await page.waitForTimeout(1000); // Allow entrance/theme transitions to settle.
      await page.screenshot({ path: `test-results/shared-${theme}.png` });
    }
    expired = true;
    await page.reload();
    await expect(page.getByPlaceholder('Enter your username')).toBeVisible();
    await expect(page.getByText('Your session expired. Please sign in again.')).toBeVisible();
    console.log('PASS: login, restoration, expiry, restart, independent providers, retry, Tableau, branding, preference migration');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
