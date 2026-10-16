/* Optional: NODE_PATH must resolve Playwright. Run with the supplied viewer HTML:
 * node tests/viewer-branding.browser.cjs <saved-viewer.html>
 * External page scripts and network requests remain disabled. */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ javaScriptEnabled: true, viewport: { width: 1900, height: 900 } });
    await page.route(/^https?:/, r => r.abort());
    const snapshotUrl = pathToFileURL(path.resolve(process.argv[2])).href;
    const html = fs.readFileSync(process.argv[2], 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
    await page.route(snapshotUrl, r => r.fulfill({ contentType: 'text/html', body: html }));
    await page.goto(snapshotUrl, { waitUntil: 'domcontentloaded' });
    for (const f of ['shared/constants.js', 'shared/storage.js', 'shared/presets.js', 'content/branding.js', 'content/theme-engine.js']) {
      await page.evaluate(s => (0, eval)(s), fs.readFileSync(path.join(root, f), 'utf8'));
    }
    await page.evaluate(css => { const s = document.createElement('style'); s.textContent = css; document.head.append(s); }, fs.readFileSync(path.join(root, 'content/injected.css'), 'utf8'));
    const result = await page.evaluate(async () => {
      const ns = CgptUiEnhancer;
      const state = { enabled: true, activePresetId: 'default-plus', background: {} };
      ns.applyThemeEngine(state);
      const titlebar = document.querySelector('header[data-app-shell-titlebar]');
      const toolbar = document.querySelector('[data-testid="viewer-header"]');
      const nativeToolbarCount = toolbar.querySelectorAll('button').length;
      const scope = document.querySelector('#app-shell-sidebar .h-toolbar');
      const svg = scope.querySelector('svg[role="img"]');
      const controls = [...scope.querySelectorAll('button')];
      const before = controls.map(n => [n.getAttribute('aria-label'), n.getBoundingClientRect().width]);
      const visible = n => getComputedStyle(n).display !== 'none' && n.getBoundingClientRect().width > 0;
      ns.applyBranding({ enabled: true, branding: { mode: 'hidden' } });
      const hidden = getComputedStyle(svg).display;
      const preserved = controls.every(visible);
      const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 40;
      canvas.getContext('2d').fillRect(0, 0, 240, 40);
      const branding = { mode: 'custom', dataUrl: canvas.toDataURL() };
      ns.applyBranding({ enabled: true, branding });
      const image = scope.querySelector('.gptt-brand-custom');
      await image.decode();
      const fit = getComputedStyle(image).objectFit;
      const rect = image.getBoundingClientRect();
      // Remount the native branding node as happens during sidebar navigation.
      const clone = svg.cloneNode(true); clone.classList.remove('gptt-brand-original-hidden');
      svg.replaceWith(clone);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const remounted = clone.classList.contains('gptt-brand-original-hidden') && clone.nextElementSibling?.classList.contains('gptt-brand-custom');
      ns.applyBranding({ enabled: false, branding });
      const restored = visible(clone) && !scope.querySelector('.gptt-brand-custom');
      ns.applyThemeEngine({ ...state, background: { dataUrl: canvas.toDataURL(), scope: 'full' } });
      const imageHeader = getComputedStyle(titlebar).backgroundColor;
      const imageHeaderPaint = getComputedStyle(titlebar).backgroundImage;
      const toolbarPreserved = toolbar.querySelectorAll('button').length === nativeToolbarCount;
      const header = { color: getComputedStyle(titlebar).backgroundColor, image: getComputedStyle(titlebar).backgroundImage };
      // Closing the viewer restores the configured conversation header.
      toolbar.remove();
      const normalHeader = getComputedStyle(titlebar).backgroundImage;
      return { hidden, preserved, fit, size: [rect.width, rect.height], remounted, restored, before, toolbarPreserved, imageHeader, imageHeaderPaint, header, normalHeader };
    });
    assert.equal(result.hidden, 'none');
    assert.equal(result.preserved, true);
    assert.equal(result.fit, 'contain');
    assert.ok(result.size[0] <= 120 && result.size[1] <= 28 && result.size[0] > 0);
    assert.equal(result.remounted, true);
    assert.equal(result.restored, true);
    assert.equal(result.toolbarPreserved, true);
    assert.equal(result.imageHeader, 'rgba(0, 0, 0, 0)');
    assert.equal(result.imageHeaderPaint, 'none');
    assert.match(result.normalHeader, /linear-gradient/);
    console.log('PASS: viewer toolbar painting, solid/image themes, close restoration, logo hide/custom/disable, fitted size, search/mode/sidebar controls, SPA remount.');
  } finally { await browser.close(); }
})();
