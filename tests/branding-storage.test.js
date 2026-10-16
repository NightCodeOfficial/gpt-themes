/* Run with node --test tests/branding-storage.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function setup(initial = {}) {
  const data = { ...initial };
  const context = vm.createContext({ chrome: { runtime: {}, storage: { local: {
    get(keys, cb) { cb(Object.fromEntries(keys.filter(k => k in data).map(k => [k, data[k]]))); },
    set(values, cb) { Object.assign(data, values); cb(); },
    remove(keys, cb) { keys.forEach(k => delete data[k]); cb(); }
  } } } });
  for (const file of ['shared/constants.js', 'shared/storage.js', 'shared/presets.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  }
  return { ns: context.CgptUiEnhancer, data };
}
test('existing installations retain original branding by default', async () => {
  const { ns } = setup();
  const state = await ns.loadFullState();
  assert.equal(state.branding.mode, 'original');
  assert.equal(state.branding.dataUrl, '');
});
test('logo choice and image persist independently of active theme', async () => {
  const { ns } = setup();
  await ns.saveBranding({ mode: 'custom', dataUrl: 'data:image/png;base64,aGVsbG8=' });
  await ns.saveActivePreset('custom');
  let state = await ns.loadFullState();
  assert.equal(state.branding.mode, 'custom');
  assert.equal(state.branding.dataUrl, 'data:image/png;base64,aGVsbG8=');
  await ns.saveBranding({ mode: 'hidden', dataUrl: state.branding.dataUrl });
  state = await ns.loadFullState();
  assert.equal(state.branding.mode, 'hidden');
  assert.equal(state.branding.dataUrl, 'data:image/png;base64,aGVsbG8=');
});
test('branding accepts only local normalized PNG data and recognized modes', () => {
  const { ns } = setup();
  for (const value of ['https://example.com/logo.png', 'javascript:alert(1)', 'data:image/svg+xml,<svg/>', 'data:image/png;base64,abc" onerror="x']) {
    assert.equal(ns.normalizeBranding({ mode: 'custom', dataUrl: value }).dataUrl, '');
  }
  assert.equal(ns.normalizeBranding({ mode: 'bad' }).mode, 'original');
  assert.equal(ns.normalizeBranding(null).mode, 'original');
});
test('reset restores original logo and clears the uploaded image', async () => {
  const { ns } = setup({ cgptUi_branding: { mode: 'hidden', dataUrl: 'data:image/png;base64,aGVsbG8=' } });
  await ns.resetAllToDefaults();
  const state = await ns.loadFullState();
  assert.equal(state.branding.mode, 'original');
  assert.equal(state.branding.dataUrl, '');
});
