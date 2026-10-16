/* Optional: NODE_PATH must resolve Playwright; uses installed Edge.
 * node tests/logo-options.browser.cjs */
const { chromium } = require('playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    await page.route(/^https?:/, r => r.abort());
    await page.addInitScript(() => {
      const data = {};
      window.__testStorage = data;
      window.chrome = { runtime: {}, storage: { local: {
        get(keys, cb) { cb(Object.fromEntries(keys.filter(k => k in data).map(k => [k, data[k]]))); },
        set(values, cb) { Object.assign(data, values); cb(); },
        remove(keys, cb) { keys.forEach(k => delete data[k]); cb(); }
      } } };
    });
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'options/options.html')).href);
    await page.waitForFunction(() => document.querySelector('#preset-select').options.length > 0);
    assert.equal(await page.locator('#logo-mode').inputValue(), 'original');
    await page.locator('#logo-mode').selectOption('custom');
    for (const [w, h] of [[4000, 1000], [1000, 4000]]) {
      await page.locator('#logo-file').setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="purple"/></svg>`) });
      await page.waitForFunction(() => document.querySelector('#logo-status').textContent.startsWith('Image ready'));
      const image = await page.locator('#logo-preview').evaluate(async n => { await n.decode(); return [n.naturalWidth, n.naturalHeight, getComputedStyle(n).objectFit]; });
      assert.ok(image[0] <= 240 && image[1] <= 56);
      assert.ok(Math.abs(image[0] / image[1] - w / h) < 0.02);
      assert.equal(image[2], 'contain');
    }
    await page.locator('#save-logo').click();
    await page.waitForFunction(() => document.querySelector('#logo-status').textContent === 'Logo settings saved.');
    let saved = await page.evaluate(() => window.__testStorage.cgptUi_branding);
    assert.equal(saved.mode, 'custom');
    assert.match(saved.dataUrl, /^data:image\/png;base64,/);
    await page.locator('#logo-mode').selectOption('hidden');
    await page.locator('#save-logo').click();
    assert.equal(await page.evaluate(() => window.__testStorage.cgptUi_branding.mode), 'hidden');
    await page.locator('#preset-select').selectOption('default-plus');
    await page.waitForFunction(() => document.querySelector('#logo-mode').value === 'hidden');
    await page.locator('#logo-mode').selectOption('custom');
    await page.locator('#logo-remove').click();
    await page.locator('#save-logo').click();
    saved = await page.evaluate(() => window.__testStorage.cgptUi_branding);
    assert.equal(saved.mode, 'original');
    assert.equal(saved.dataUrl, '');
    await page.locator('#logo-mode').selectOption('custom');
    await page.locator('#save-logo').click();
    assert.match(await page.locator('#logo-status').textContent(), /Choose a custom image/);
    await page.locator('#logo-file').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('invalid image') });
    await page.waitForFunction(() => document.querySelector('#logo-status').textContent.startsWith('Could not load image'));
    assert.equal(await page.locator('#save-logo').isEnabled(), true);
    console.log('PASS: settings UI, landscape/portrait resizing, aspect ratio, PNG normalization, save/load, hide/remove, missing and invalid image errors.');
  } finally { await browser.close(); }
})();
