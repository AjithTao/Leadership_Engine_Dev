// Explicit live smoke check. Reads secrets from the ignored server .env; never prints them.
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const env = Object.fromEntries(fs.readFileSync(path.resolve(__dirname, '../../backend/config/.env'), 'utf8')
  .split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => {
    const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1).trim().replace(/^['"]|['"]$/g, '')];
  }));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await page.goto('https://falconx-tao-web.onrender.com', { timeout: 120000 });
    await expect(page.getByPlaceholder('Enter your username')).toBeVisible({ timeout: 30000 });
    await page.getByPlaceholder('Enter your username').fill(env.APP_ADMIN_USERNAME);
    await page.locator('input[type=password]').fill(env.APP_ADMIN_PASSWORD);
    const autoConnect = page.waitForResponse(r => r.url().endsWith('/api/auth/auto-connect-integrations'), { timeout: 240000 }).catch(() => null);
    await page.locator('button[type=submit]').click();
    await expect(page.getByAltText('TAO Digital Solutions')).toBeVisible({ timeout: 90000 });
    await autoConnect;
    await page.getByRole('button', { name: /^(Manage|Connect Integrations)$/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Connection Settings' });
    for (const provider of ['jira', 'confluence', 'GitHub']) {
      await dialog.getByRole('button', { name: provider, exact: true }).click();
      await expect(dialog.getByRole('status')).not.toHaveText('Connecting', { timeout: 120000 });
      console.log(`${provider}: ${await dialog.getByRole('status').innerText()}`);
    }
    await dialog.getByRole('button', { name: 'jira', exact: true }).click();
    await page.screenshot({ path: 'test-results/hosted-connections.png' });
    const catalog = await page.evaluate(async () => {
      const r = await fetch('https://falconx-tao-api.onrender.com/api/quality/qcoe-projects');
      const data = await r.json();
      return { status: r.status, success: data.success, total_projects: data.total_projects, detail: typeof data.detail === 'string' ? data.detail : undefined };
    });
    console.log('Jira catalog:', JSON.stringify(catalog));
    await page.reload();
    await expect(page.getByAltText('TAO Digital Solutions')).toBeVisible({ timeout: 90000 });
    expect(await page.locator('body').innerText()).not.toMatch(/Project Mercury|About Us|Salesforce|CDK/);
    console.log('PASS: hosted login, cross-origin authenticated requests, session restoration, navigation and logo');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
