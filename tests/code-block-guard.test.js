/* Run with: node --test tests/code-block-guard.test.js (Node 18+). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');

class ClassList {
  constructor(owner, initial = '') {
    this.owner = owner;
    this.values = new Set(String(initial).split(/\s+/).filter(Boolean));
  }
  add(...names) { names.forEach(name => this.values.add(name)); this.sync(); }
  remove(...names) { names.forEach(name => this.values.delete(name)); this.sync(); }
  contains(name) { return this.values.has(name); }
  sync() { this.owner.className = Array.from(this.values).join(' '); }
}

class MockElement {
  constructor(tag, attrs = {}, children = []) {
    this.tagName = tag.toUpperCase();
    this.attributes = { ...attrs };
    this.parentElement = null;
    this.children = [];
    this.className = attrs.class || '';
    this.classList = new ClassList(this, this.className);
    for (const child of children) this.appendChild(child);
  }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  getAttribute(name) {
    if (name === 'class') return this.className || null;
    return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null;
  }
  contains(node) {
    for (let current = node; current; current = current.parentElement) if (current === this) return true;
    return false;
  }
  matches(selector) {
    return selector.split(',').some(raw => this.matchesOne(raw.trim()));
  }
  matchesOne(selector) {
    if (!selector) return false;
    if (selector === 'html' || selector === 'body' || selector === 'main' || selector === 'pre' || selector === 'code' || selector === 'button') {
      return this.tagName.toLowerCase() === selector;
    }
    if (selector === '.markdown') return this.classList.contains('markdown');
    if (selector === '#cgpt-theme-builder') return this.getAttribute('id') === 'cgpt-theme-builder';
    if (selector === '.cgpt-theme-builder-panel') return this.classList.contains('cgpt-theme-builder-panel');
    if (selector === '.cgpt-theme-builder-modal') return this.classList.contains('cgpt-theme-builder-modal');
    if (selector === "[data-message-author-role]") return this.getAttribute('data-message-author-role') !== null;
    if (selector === "[data-message-author-role='assistant']") return this.getAttribute('data-message-author-role') === 'assistant';
    if (selector === "[data-markdown-text-style='assistant-message']") return this.getAttribute('data-markdown-text-style') === 'assistant-message';
    if (selector === '[data-markdown-copy="code-block"]') return this.getAttribute('data-markdown-copy') === 'code-block';
    if (selector === '[data-markdown-copy="exclude"]') return this.getAttribute('data-markdown-copy') === 'exclude';
    if (selector === '[data-markdown-copy="inline-code"]') return this.getAttribute('data-markdown-copy') === 'inline-code';
    if (selector === "[data-testid^='conversation-turn']") return (this.getAttribute('data-testid') || '').startsWith('conversation-turn');
    if (selector === 'article[data-turn]') return this.tagName === 'ARTICLE' && this.getAttribute('data-turn') !== null;
    if (selector === "[role='button']") return this.getAttribute('role') === 'button';
    if (selector === "[data-testid*='copy' i]") return /copy/i.test(this.getAttribute('data-testid') || '');
    if (selector === "[aria-label*='copy' i]") return /copy/i.test(this.getAttribute('aria-label') || '');
    if (selector === "[title*='copy' i]") return /copy/i.test(this.getAttribute('title') || '');
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    return false;
  }
  closest(selector) {
    for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node;
    return null;
  }
  querySelectorAll(selector) {
    const out = [];
    for (const child of this.children) {
      if (child.matches(selector)) out.push(child);
      out.push(...child.querySelectorAll(selector));
    }
    return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

class MockDocument {
  constructor(rootEl) {
    this.rootEl = rootEl;
    this.documentElement = rootEl;
    this.readyState = 'loading';
    this.listeners = {};
  }
  querySelectorAll(selector) {
    const out = [];
    if (this.rootEl.matches(selector)) out.push(this.rootEl);
    return out.concat(this.rootEl.querySelectorAll(selector));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
}

function createFixture({ toolbar = true, fallbackClass = 'contain-inline-size rounded-xl border-token-border-medium' } = {}) {
  const code = new MockElement('code', { class: 'language-plaintext' });
  const pre = new MockElement('pre', {}, [code]);
  const body = new MockElement('div', { class: 'overflow-y-auto p-4' }, [pre]);
  const headerChild = toolbar
    ? new MockElement('button', { 'aria-label': 'Copy code' })
    : new MockElement('span');
  const header = new MockElement('div', { class: 'flex items-center' }, [headerChild]);
  const shell = new MockElement('div', { class: fallbackClass }, [header, body]);
  const markdown = new MockElement('div', { class: 'markdown' }, [shell]);
  const assistant = new MockElement('div', { 'data-message-author-role': 'assistant' }, [markdown]);
  const main = new MockElement('main', {}, [assistant]);
  const html = new MockElement('html', {}, [main]);
  const document = new MockDocument(html);
  return { document, shell, header, body, pre, code, assistant, markdown };
}

function createCurrentNoPreFixture() {
  const code = new MockElement('code', { class: 'whitespace-pre block text-size-code' });
  const body = new MockElement('div', { class: 'overflow-auto px-4 pt-0 pb-3' }, [code]);
  const header = new MockElement('div', { 'data-markdown-copy': 'exclude', class: 'flex items-center sticky' }, [
    new MockElement('span'),
    new MockElement('button', { 'aria-label': 'Copy code' })
  ]);
  const shell = new MockElement('div', {
    'data-markdown-copy': 'code-block',
    class: 'relative overflow-clip rounded-xl border'
  }, [header, body]);
  const wrapper = new MockElement('div', { class: 'CodeBlock-current' }, [shell]);
  const markdown = new MockElement('div', { 'data-markdown-text-style': 'assistant-message' }, [wrapper]);
  const assistant = new MockElement('div', {}, [markdown]);
  const main = new MockElement('main', {}, [assistant]);
  const html = new MockElement('html', {}, [main]);
  const document = new MockDocument(html);
  return { document, shell, header, body, code, markdown };
}

function loadGuard(document) {
  const context = {
    Element: MockElement,
    document,
    MutationObserver: undefined,
    requestAnimationFrame: fn => fn(),
    setTimeout: fn => fn(),
    Date,
  };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'content/code-block-guard.js'), 'utf8'), context);
  return context.CgptUiEnhancer;
}

test('marks the current semantic fenced-code shell even when ChatGPT renders no pre element', () => {
  const fixture = createCurrentNoPreFixture();
  const ns = loadGuard(fixture.document);
  const report = ns.refreshCodeBlockGuards();

  assert.equal(report.fencedBlockCount, 1);
  assert.equal(report.semanticBlockCount, 1);
  assert.equal(report.legacyPreCount, 0);
  assert.equal(report.fencedPreCount, 0);
  assert.equal(report.guardedShellCount, 1);
  assert.equal(report.fallbackCount, 0);
  assert.equal(fixture.shell.classList.contains('cgpt-code-block-shell'), true);
  assert.equal(fixture.header.classList.contains('cgpt-code-block-header'), true);
  assert.equal(fixture.body.classList.contains('cgpt-code-block-body'), true);
  assert.equal(fixture.code.classList.contains('cgpt-code-block-code'), true);
});

test('marks the native fenced-code shell, body path, header and semantic nodes', () => {
  const fixture = createFixture();
  const ns = loadGuard(fixture.document);
  const report = ns.refreshCodeBlockGuards();

  assert.equal(report.fencedBlockCount, 1);
  assert.equal(report.semanticBlockCount, 0);
  assert.equal(report.legacyPreCount, 1);
  assert.equal(report.fencedPreCount, 1);
  assert.equal(report.guardedShellCount, 1);
  assert.equal(report.fallbackCount, 0);
  assert.equal(fixture.shell.classList.contains('cgpt-code-block-shell'), true);
  assert.equal(fixture.body.classList.contains('cgpt-code-block-body'), true);
  assert.equal(fixture.header.classList.contains('cgpt-code-block-header'), true);
  assert.equal(fixture.pre.classList.contains('cgpt-code-block-pre'), true);
  assert.equal(fixture.code.classList.contains('cgpt-code-block-code'), true);
});

test('uses a narrow styled-wrapper fallback when ChatGPT moves the copy control elsewhere', () => {
  const fixture = createFixture({ toolbar: false });
  const ns = loadGuard(fixture.document);
  const report = ns.refreshCodeBlockGuards();

  assert.equal(report.guardedShellCount, 1);
  assert.equal(report.fallbackCount, 1);
  assert.equal(fixture.shell.classList.contains('cgpt-code-block-shell'), true);
  assert.equal(fixture.assistant.classList.contains('cgpt-code-block-shell'), false);
  assert.equal(fixture.markdown.classList.contains('cgpt-code-block-shell'), false);
});

test('does not promote an entire message when a bare pre has no plausible code-block wrapper', () => {
  const code = new MockElement('code');
  const pre = new MockElement('pre', {}, [code]);
  const paragraph = new MockElement('p');
  const markdown = new MockElement('div', { class: 'markdown' }, [paragraph, pre]);
  const assistant = new MockElement('div', { 'data-message-author-role': 'assistant' }, [markdown]);
  const main = new MockElement('main', {}, [assistant]);
  const document = new MockDocument(new MockElement('html', {}, [main]));
  const ns = loadGuard(document);
  const report = ns.refreshCodeBlockGuards();

  assert.equal(report.fencedPreCount, 1);
  assert.equal(report.guardedShellCount, 0);
  assert.equal(markdown.classList.contains('cgpt-code-block-shell'), false);
  assert.equal(assistant.classList.contains('cgpt-code-block-shell'), false);
  assert.equal(pre.classList.contains('cgpt-code-block-pre'), true);
});

test('inline code is not mistaken for a fenced code block', () => {
  const code = new MockElement('code');
  const paragraph = new MockElement('p', {}, [code]);
  const markdown = new MockElement('div', { class: 'markdown' }, [paragraph]);
  const assistant = new MockElement('div', { 'data-message-author-role': 'assistant' }, [markdown]);
  const main = new MockElement('main', {}, [assistant]);
  const document = new MockDocument(new MockElement('html', {}, [main]));
  const ns = loadGuard(document);
  const report = ns.refreshCodeBlockGuards();

  assert.equal(report.fencedPreCount, 0);
  assert.equal(report.guardedShellCount, 0);
  assert.equal(code.classList.contains('cgpt-code-block-code'), false);
});

test('manifest loads the guard before the compatibility probe and CSS themes guarded wrappers', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const mainScript = manifest.content_scripts.find(item => item.js && item.js.includes('content/compatibility-probe.js'));
  const guardIndex = mainScript.js.indexOf('content/code-block-guard.js');
  const probeIndex = mainScript.js.indexOf('content/compatibility-probe.js');
  assert.ok(guardIndex >= 0 && guardIndex < probeIndex);
  assert.equal(manifest.version, '0.8.31');

  const css = fs.readFileSync(path.join(root, 'content/injected.css'), 'utf8');
  assert.match(css, /\[data-markdown-copy="code-block"\]/);
  assert.match(css, /\[data-markdown-copy="inline-code"\]/);
  assert.match(css, /\.cgpt-code-block-shell/);
  assert.match(css, /\.cgpt-code-block-body/);
  assert.match(css, /\.cgpt-code-block-code/);
  assert.match(css, /background:\s*transparent\s*!important/);
  assert.doesNotMatch(
    css,
    /html\.cgpt-ui-enhancer-active \.markdown code\s*\{[^}]*background-color:/s
  );

  const registry = fs.readFileSync(path.join(root, 'content/target-registry.js'), 'utf8');
  assert.match(registry, /\[data-markdown-copy="code-block"\]/);
  assert.match(registry, /\.cgpt-code-block-shell/);
});
