/* Run with: node --test tests/navigation-tab-guard.test.js (Node 18+). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');

class MockElement {
  constructor(tag, attrs = {}, children = []) {
    this.tagName = tag.toUpperCase();
    this.attributes = attrs;
    this.parentElement = null;
    this.children = [];
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }
  getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; }
  matches(selector) {
    return selector.split(',').some(part => {
      const s = part.trim();
      if (s === 'button' || s === 'a' || s === 'input' || s === 'textarea' || s === 'select') return s === this.tagName.toLowerCase();
      if (s === 'a[href]') return this.tagName === 'A' && !!this.getAttribute('href');
      if (s === '.sidebar-item') return (this.getAttribute('class') || '').split(' ').includes('sidebar-item');
      if (s === 'li[class*="project-chat"]' || s === "li[class*='project-chat']") return this.tagName === 'LI' && (this.getAttribute('class') || '').includes('project-chat');
      if (s === "[data-app-action-sidebar-project-row][data-app-action-sidebar-project-id]") return this.getAttribute('data-app-action-sidebar-project-row') !== null && !!this.getAttribute('data-app-action-sidebar-project-id');
      if (s === '[data-app-action-sidebar-project-row]') return this.getAttribute('data-app-action-sidebar-project-row') !== null;
      if (s === "[data-sidebar-project-container-id^='project:'][data-sidebar-project-kind]") return (this.getAttribute('data-sidebar-project-container-id') || '').startsWith('project:') && !!this.getAttribute('data-sidebar-project-kind');
      if (s === ".sidebar-item[role='button']") return this.matches('.sidebar-item') && this.getAttribute('role') === 'button';
      if (s === "[contenteditable='true']") return this.getAttribute('contenteditable') === 'true';
      if (s === "[aria-haspopup='menu']") return this.getAttribute('aria-haspopup') === 'menu';
      if (s.startsWith('[role=')) return this.getAttribute('role') === s.slice(7, -2);
      if (s === '#cgpt-theme-builder') return this.getAttribute('id') === 'cgpt-theme-builder';
      if (s === '#app-shell-sidebar') return this.getAttribute('id') === 'app-shell-sidebar';
      if (s === '#stage-slideover-sidebar') return this.getAttribute('id') === 'stage-slideover-sidebar';
      if (s === '.cgpt-theme-builder-panel') return (this.getAttribute('class') || '').includes('cgpt-theme-builder-panel');
      return false;
    });
  }
  closest(selector) {
    for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node;
    return null;
  }
  contains(child) { for (let node = child; node; node = node.parentElement) if (node === this) return true; return false; }
  querySelectorAll(selector) {
    const result = [];
    for (const child of this.children) {
      if (child.matches(selector)) result.push(child);
      result.push(...child.querySelectorAll(selector));
    }
    return result;
  }
}

function setupContent(url = 'https://chatgpt.com/') {
  const listeners = {};
  const messages = [];
  const fallback = [];
  let onStorageChange = null;
  let storageEnabled = true;
  const context = {
    Element: MockElement,
    URL,
    location: { href: url },
    addEventListener: (type, listener, capture) => { assert.equal(capture, true); listeners[type] = listener; },
    open: (...args) => fallback.push(args),
    chrome: {
      runtime: { sendMessage: (message, response) => { messages.push(message); response({ ok: true }); }, lastError: null },
      storage: {
        local: { get: (key, response) => response({ cgptUi_enabled: storageEnabled }) },
        onChanged: { addListener: callback => { onStorageChange = callback; } }
      }
    }
  };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'content/navigation-tab-guard.js'), 'utf8'), context);
  return { context, listeners, messages, fallback, toggle: value => { storageEnabled = value; onStorageChange({ cgptUi_enabled: { newValue: value } }, "local"); } };
}

function mouse(type, target, props = {}) {
  return {
    type, target, isTrusted: true, button: 0, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
    defaultPrevented: false, stopped: false, ...props,
    preventDefault() { this.defaultPrevented = true; },
    stopImmediatePropagation() { this.stopped = true; }
  };
}

function chatRow(href = '/c/chat-123') {
  const text = new MockElement('span');
  const anchor = new MockElement('a', { href, 'data-interactive-row-link': 'true' }, [text]);
  const row = new MockElement('div', { class: 'sidebar-item' }, [anchor]);
  return { row, text, anchor };
}

function projectRow(id = 'g-p-abc123') {
  const label = new MockElement('span');
  const icon = new MockElement('svg');
  const actions = new MockElement('button', { 'aria-haspopup': 'menu' }, [icon]);
  const row = new MockElement('div', {
    class: 'sidebar-item', role: 'button',
    'data-app-action-sidebar-project-row': '',
    'data-app-action-sidebar-project-id': id
  }, [label, actions]);
  return { row, label, actions, icon };
}

function projectRowWithPencil(id = 'g-p-abc123', name = 'A Project') {
  // Matches the September 2026 sidebar: a role=button project row contains a
  // real button with aria-label="New chat in <project name>" and an SVG icon.
  const label = new MockElement('span');
  const icon = new MockElement('svg');
  const pencil = new MockElement('button', { 'aria-label': `New chat in ${name}` }, [icon]);
  const menu = new MockElement('button', { 'aria-haspopup': 'menu' });
  const row = new MockElement('div', {
    class: 'sidebar-item', role: 'button',
    'data-app-action-sidebar-project-row': '',
    'data-app-action-sidebar-project-id': id,
    'data-app-action-sidebar-project-label': name
  }, [label, pencil, menu]);
  return { row, label, pencil, icon, menu };
}

test('Ctrl+click on a native chat anchor opens one background tab, not the current page', () => {
  const { listeners, messages, context } = setupContent();
  const { text } = chatRow();
  const e = mouse('click', text, { ctrlKey: true });
  listeners.click(e);
  assert.equal(e.defaultPrevented, true);
  assert.equal(e.stopped, true);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].url, 'https://chatgpt.com/c/chat-123');
  assert.equal(messages[0].active, false);
  assert.equal(context.CgptUiEnhancer.getNavigationTabGuardReport().lastKind, 'link');
});

test('Middle click on a project chat deep link preserves the project and chat IDs', () => {
  const { listeners, messages } = setupContent();
  const { anchor } = chatRow('/g/g-p-project123/c/chat123?mode=test');
  const e = mouse('auxclick', anchor, { button: 1 });
  listeners.auxclick(e);
  assert.equal(e.defaultPrevented, true);
  assert.equal(messages[0].url, 'https://chatgpt.com/g/g-p-project123/c/chat123?mode=test');
});

test('Ctrl+click on linkless project title opens the project without expanding it', () => {
  const { listeners, messages } = setupContent();
  const { label } = projectRow();
  const e = mouse('click', label, { ctrlKey: true, shiftKey: true });
  listeners.click(e);
  assert.equal(e.stopped, true);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].url, 'https://chatgpt.com/g/g-p-abc123');
  assert.equal(messages[0].active, true);
});

test('Middle click on linkless project row cancels autoscroll and opens one tab', () => {
  const { listeners, messages } = setupContent();
  const { label } = projectRow();
  const down = mouse('mousedown', label, { button: 1 });
  listeners.mousedown(down);
  assert.equal(down.defaultPrevented, true);
  assert.equal(messages.length, 0);
  const up = mouse('auxclick', label, { button: 1 });
  listeners.auxclick(up);
  assert.equal(messages.length, 1);
  assert.equal(up.stopped, true);
});

test('Ctrl+click on the project pencil icon opens a blank composer IN that Project', () => {
  const { listeners, messages, context } = setupContent('https://chatgpt.com/c/existing-chat');
  const { icon } = projectRowWithPencil('g-p-myproject', 'My Project');
  const event = mouse('click', icon, { ctrlKey: true });
  listeners.click(event);
  assert.equal(event.stopped, true);
  assert.equal(event.defaultPrevented, true);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].url, 'https://chatgpt.com/g/g-p-myproject');
  assert.equal(messages[0].active, false);
  assert.equal(context.CgptUiEnhancer.getNavigationTabGuardReport().lastKind, 'project-new-chat');
});

test('Middle click on the project pencil suppresses autoscroll and opens a new project tab', () => {
  const { listeners, messages } = setupContent();
  const { icon } = projectRowWithPencil();
  const down = mouse('mousedown', icon, { button: 1 });
  listeners.mousedown(down);
  assert.equal(down.defaultPrevented, true);
  const up = mouse('auxclick', icon, { button: 1 });
  listeners.auxclick(up);
  assert.equal(up.stopped, true);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].url, 'https://chatgpt.com/g/g-p-abc123');
});

test('Ctrl+Shift+click on project pencil opens a foreground tab', () => {
  const { listeners, messages } = setupContent();
  const { pencil } = projectRowWithPencil();
  listeners.click(mouse('click', pencil, { ctrlKey: true, shiftKey: true }));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].active, true);
});

test('New chat button in the sidebar rail opens a new independent chat tab', () => {
  const { listeners, messages, context } = setupContent('https://chatgpt.com/g/g-p-current/c/chat123');
  const icon = new MockElement('svg');
  const button = new MockElement('button', { 'aria-label': 'New chat', class: 'sidebar-item' }, [icon]);
  new MockElement('nav', { 'data-app-navigation-rail': 'true' }, [button]);
  const event = mouse('auxclick', icon, { button: 1 });
  listeners.auxclick(event);
  assert.equal(event.stopped, true);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].url, 'https://chatgpt.com/');
  assert.equal(context.CgptUiEnhancer.getNavigationTabGuardReport().lastKind, 'new-chat');
});

test('Ctrl+click on the Recents section New chat button opens the home composer', () => {
  const { listeners, messages } = setupContent();
  const button = new MockElement('button', { 'aria-label': 'New chat' });
  new MockElement('section', { 'data-app-action-sidebar-section-heading': 'Recents' }, [button]);
  const event = mouse('click', button, { ctrlKey: true });
  listeners.click(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(messages[0].url, 'https://chatgpt.com/');
});

test('Expanded sidebar visible New chat row has no aria-label and still opens a new tab', () => {
  const { listeners, messages } = setupContent();
  const title = new MockElement('span', { class: 'text-fade-truncate' });
  const button = new MockElement('button', { class: 'sidebar-item group' }, [title]);
  button.textContent = ' New chat ';
  const nav = new MockElement('nav', { role: 'navigation' }, [button]);
  new MockElement('div', { id: 'app-shell-sidebar' }, [nav]);
  const event = mouse('auxclick', title, { button: 1 });
  listeners.auxclick(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].url, 'https://chatgpt.com/');
});

test('Do not guess based on unlabeled New chat text outside the ChatGPT sidebar', () => {
  const { listeners, messages } = setupContent();
  const button = new MockElement('button', { class: 'sidebar-item' });
  button.textContent = 'New chat';
  const event = mouse('click', button, { ctrlKey: true });
  listeners.click(event);
  assert.equal(event.defaultPrevented, false);
  assert.equal(messages.length, 0);
});

test('Cmd+click works for New chat on macOS and keeps the original tab in place', () => {
  const { listeners, messages } = setupContent('https://chat.openai.com/c/current');
  const button = new MockElement('button', { 'aria-label': 'New chat' });
  const event = mouse('click', button, { metaKey: true });
  listeners.click(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.stopped, true);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].url, 'https://chat.openai.com/');
});

test('Alternate New chat title and generic label in project row preserve their scope', () => {
  const { listeners, messages } = setupContent();
  const globalButton = new MockElement('button', { title: 'New chat' });
  listeners.click(mouse('click', globalButton, { ctrlKey: true }));
  const pencil = new MockElement('button', { 'aria-label': 'New chat' });
  new MockElement('div', {
    'data-app-action-sidebar-project-row': '',
    'data-app-action-sidebar-project-id': 'g-p-target', role: 'button'
  }, [pencil]);
  listeners.auxclick(mouse('auxclick', pencil, { button: 1 }));
  assert.deepEqual(messages.map(x => x.url), ['https://chatgpt.com/', 'https://chatgpt.com/g/g-p-target']);
});

test('Project pencil works on the phased container layout without row action attributes', () => {
  const { listeners, messages } = setupContent();
  const icon = new MockElement('svg');
  const pencil = new MockElement('button', { 'aria-label': 'New chat in Phase Project' }, [icon]);
  const row = new MockElement('div', { class: 'sidebar-item', role: 'button' }, [pencil]);
  new MockElement('div', {
    'data-sidebar-project-container-id': 'project:g-p-phased', 'data-sidebar-project-kind': 'local'
  }, [row]);
  listeners.auxclick(mouse('auxclick', icon, { button: 1 }));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].url, 'https://chatgpt.com/g/g-p-phased');
});

test('Unknown project pencil, malformed IDs and disabled New chat buttons are untouched', () => {
  const { listeners, messages } = setupContent();
  const orphan = new MockElement('button', { 'aria-label': 'New chat in Unknown Project' });
  const badProject = projectRowWithPencil('not-a-project').icon;
  const disabled = new MockElement('button', { 'aria-label': 'New chat', disabled: '' });
  const ariaDisabled = new MockElement('button', { 'aria-label': 'New chat', 'aria-disabled': 'true' });
  for (const node of [orphan, badProject, disabled, ariaDisabled]) {
    const event = mouse('auxclick', node, { button: 1 });
    listeners.auxclick(event);
    assert.equal(event.defaultPrevented, false);
  }
  assert.equal(messages.length, 0);
});

test('Ordinary clicks and unrelated controls remain native, even inside project rows', () => {
  const { listeners, messages } = setupContent();
  const { pencil, menu } = projectRowWithPencil();
  const newChat = new MockElement('button', { 'aria-label': 'New chat' });
  for (const node of [pencil, menu, newChat]) {
    const normal = mouse('click', node);
    listeners.click(normal);
    assert.equal(normal.defaultPrevented, false);
    const rightClick = mouse('auxclick', node, { button: 2 });
    listeners.auxclick(rightClick);
    assert.equal(rightClick.defaultPrevented, false);
  }
  assert.equal(messages.length, 0);
});

test('Alt+Ctrl click, untrusted clicks and disabled extension do not intercept New chat', () => {
  const { listeners, messages, toggle } = setupContent();
  const button = new MockElement('button', { 'aria-label': 'New chat' });
  for (const event of [
    mouse('click', button, { ctrlKey: true, altKey: true }),
    mouse('click', button, { ctrlKey: true, isTrusted: false })
  ]) {
    listeners.click(event);
    assert.equal(event.defaultPrevented, false);
  }
  toggle(false);
  const disabled = mouse('click', button, { ctrlKey: true });
  listeners.click(disabled);
  assert.equal(disabled.defaultPrevented, false);
  assert.equal(messages.length, 0);
});

test('Explicit native home anchors open a new chat tab without relying on a button', () => {
  const { listeners, messages } = setupContent();
  const icon = new MockElement('svg');
  new MockElement('a', { href: '/' }, [icon]);
  listeners.auxclick(mouse('auxclick', icon, { button: 1 }));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].url, 'https://chatgpt.com/');
});

test('Normal clicks, Alt+click, untrusted scripts and right-click are untouched', () => {
  const { listeners, messages } = setupContent();
  const { text } = chatRow();
  for (const e of [mouse('click', text), mouse('click', text, { ctrlKey: true, altKey: true }), mouse('click', text, { ctrlKey: true, isTrusted: false }), mouse('auxclick', text, { button: 2 })]) {
    listeners[e.type](e);
    assert.equal(e.defaultPrevented, false);
  }
  assert.equal(messages.length, 0);
});

test('Native project row action buttons and other destinations are unaffected', () => {
  const { listeners, messages } = setupContent();
  const { icon } = projectRow();
  const invalid = chatRow('https://external.example/c/chat-123');
  for (const node of [icon, invalid.text]) {
    const e = mouse('auxclick', node, { button: 1 });
    listeners.auxclick(e);
    assert.equal(e.defaultPrevented, false);
  }
  assert.equal(messages.length, 0);
});

test('Clicking chat-row padding targets the single chat anchor', () => {
  const { listeners, messages } = setupContent();
  const { row } = chatRow();
  const e = mouse('click', row, { metaKey: true });
  listeners.click(e);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].url, 'https://chatgpt.com/c/chat-123');
});

test('Rows containing multiple chat links are not guessed from padding', () => {
  const { listeners, messages } = setupContent();
  const row = new MockElement('div', { class: 'sidebar-item' }, [
    new MockElement('a', { href: '/c/chat-1' }), new MockElement('a', { href: '/c/chat-2' })
  ]);
  listeners.click(mouse('click', row, { ctrlKey: true }));
  assert.equal(messages.length, 0);
});

test('Fallback project container supports renamed project-row attributes', () => {
  const { listeners, messages } = setupContent();
  const label = new MockElement('span');
  const row = new MockElement('div', { class: 'sidebar-item', role: 'button' }, [label]);
  new MockElement('div', { 'data-sidebar-project-container-id': 'project:g-p-fallback', 'data-sidebar-project-kind': 'local' }, [row]);
  listeners.auxclick(mouse('auxclick', label, { button: 1 }));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].url, 'https://chatgpt.com/g/g-p-fallback');
});

test('Background worker creates an inactive tab beside the source and validates input', () => {
  const created = [];
  let onMessage;
  const chrome = {
    runtime: { lastError: null, onMessage: { addListener: fn => { onMessage = fn; } } },
    tabs: { create: (opts, callback) => { created.push(opts); callback({ id: 22 }); } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'background/navigation-tabs.js'), 'utf8'), { chrome, URL, Set });
  const sender = { url: 'https://chatgpt.com/', tab: { id: 11, index: 3, windowId: 7 } };
  const responses = [];
  const send = (url, active = false, from = sender) => onMessage({ type: 'cgpt-ui-open-navigation-tab', url, active }, from, r => responses.push(r));
  assert.equal(send('https://chatgpt.com/g/g-p-abc123'), true);
  assert.equal(created[0].url, 'https://chatgpt.com/g/g-p-abc123');
  assert.equal(created[0].active, false);
  assert.equal(created[0].index, 4);
  assert.equal(created[0].windowId, 7);
  assert.equal(responses[0].ok, true);
  assert.equal(send('https://chatgpt.com/'), true);
  assert.equal(created[1].url, 'https://chatgpt.com/');
  assert.equal(send('https://external.example/c/foo'), false);
  assert.equal(send('https://chatgpt.com/?next=https://external.example'), false);
  assert.equal(send('https://chatgpt.com/#malicious'), false);
  assert.equal(send('http://chatgpt.com/'), false);
  assert.equal(send('https://chatgpt.com.evil.example/c/foo'), false);
  assert.equal(send('https://chatgpt.com/pricing'), false);
  assert.equal(send('https://chatgpt.com/c/chat1', false, { url: 'https://external.example/', tab: { id: 4 } }), false);
  assert.equal(created.length, 2);
});

test('Master enable toggle controls navigation interception without a reload', () => {
  const { listeners, messages, toggle, context } = setupContent();
  const { text } = chatRow();
  toggle(false);
  const disabled = mouse('click', text, { ctrlKey: true });
  listeners.click(disabled);
  assert.equal(disabled.defaultPrevented, false);
  assert.equal(messages.length, 0);
  assert.equal(context.CgptUiEnhancer.getNavigationTabGuardReport().enabled, false);
  toggle(true);
  listeners.click(mouse('click', text, { ctrlKey: true }));
  assert.equal(messages.length, 1);
});

test('Manifest loads document-start listener before site scripts, with a background worker', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.version, '0.8.31');
  assert.equal(manifest.content_scripts[0].run_at, 'document_start');
  assert.deepEqual(manifest.content_scripts[0].js, ['content/navigation-tab-guard.js']);
  assert.equal(manifest.background.service_worker, 'background/navigation-tabs.js');
});

function builtinPageButton(destination, label = '', rail = false) {
  // Mirrors the September 26 saved ChatGPT HTML: a button.sidebar-item with
  // data-sidebar-destination inside #app-shell-sidebar. The rail's Library
  // button also has aria-label='Library'.
  const icon = new MockElement('svg');
  const title = new MockElement('span', { class: 'text-fade-truncate' });
  const button = new MockElement('button', {
    class: 'sidebar-item relative cursor-interaction',
    'data-sidebar-destination': destination,
    ...(label && rail ? { 'aria-label': label } : {})
  }, [icon, title]);
  new MockElement('div', { id: 'app-shell-sidebar' }, [
    new MockElement('nav', rail ? { 'data-app-navigation-rail': 'true' } : { role: 'navigation' }, [button])
  ]);
  return { button, icon, title };
}

for (const [name, token, route] of [
  ['Scheduled', 'builtin:automations', '/scheduled'],
  ['Library', 'builtin:library', '/library'],
  ['Plugins', 'builtin:skills', '/plugins']
]) {
  test(`Middle-click on ${name} page button opens an adjacent background tab`, () => {
    const { listeners, messages, context } = setupContent();
    const { icon } = builtinPageButton(token, name);
    const down = mouse('mousedown', icon, { button: 1 });
    listeners.mousedown(down);
    assert.equal(down.defaultPrevented, true, 'prevent autoscroll on linkless navigation');
    const event = mouse('auxclick', icon, { button: 1 });
    listeners.auxclick(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.stopped, true);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].url, `https://chatgpt.com${route}`);
    assert.equal(messages[0].kind, 'sidebar-page');
    assert.equal(messages[0].active, false);
    assert.equal(context.CgptUiEnhancer.getNavigationTabGuardReport().lastKind, 'sidebar-page');
  });

  test(`Ctrl/Cmd+Shift click on ${name} opens a foreground tab, ordinary click stays native`, () => {
    const { listeners, messages } = setupContent('https://chatgpt.com/c/existing-chat');
    const { title } = builtinPageButton(token, name);
    const plain = mouse('click', title);
    listeners.click(plain);
    assert.equal(plain.defaultPrevented, false);
    assert.equal(messages.length, 0);
    const modified = mouse('click', title, { metaKey: true, shiftKey: true });
    listeners.click(modified);
    assert.equal(modified.stopped, true);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].url, `https://chatgpt.com${route}`);
    assert.equal(messages[0].active, true);
  });
}

test('Collapsed rail Library and nested SVG are both clickable without inferring labels', () => {
  const { listeners, messages } = setupContent();
  const { icon } = builtinPageButton('builtin:library', 'Library', true);
  listeners.auxclick(mouse('auxclick', icon, { button: 1 }));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].url, 'https://chatgpt.com/library');
});

test('Unknown sidebar destination is never guessed, and disabled page buttons do nothing', () => {
  const { listeners, messages } = setupContent();
  const unknown = builtinPageButton('builtin:future-page').icon;
  const fake = new MockElement('button', { class: 'sidebar-item', 'data-sidebar-destination': 'builtin:library' });
  const outside = new MockElement('button', { class: 'sidebar-item', 'data-sidebar-destination': 'builtin:skills' });
  new MockElement('div', { id: 'unrelated-panel' }, [outside]);
  const disabled = builtinPageButton('builtin:library').button;
  disabled.attributes['aria-disabled'] = 'true';
  const menu = new MockElement('button', { class: 'sidebar-item', 'aria-haspopup': 'menu' });
  for (const element of [unknown, fake, outside, disabled, menu]) {
    const event = mouse('auxclick', element, { button: 1 });
    listeners.auxclick(event);
    assert.equal(event.defaultPrevented, false);
  }
  assert.equal(messages.length, 0);
});

test('Other actual ChatGPT pages with native anchors use their declared URL', () => {
  const { listeners, messages } = setupContent('https://chatgpt.com/c/existing');
  for (const pathname of ['/gpts/mine?tab=mine', '/plugins?q=design', '/scheduled', '/library/folders/xyz', '/images', '/projects']) {
    const icon = new MockElement('svg');
    new MockElement('a', { href: pathname }, [icon]);
    listeners.auxclick(mouse('auxclick', icon, { button: 1 }));
  }
  assert.deepEqual(messages.map(x => x.url), [
    'https://chatgpt.com/gpts/mine?tab=mine',
    'https://chatgpt.com/plugins?q=design',
    'https://chatgpt.com/scheduled',
    'https://chatgpt.com/library/folders/xyz',
    'https://chatgpt.com/images',
    'https://chatgpt.com/projects'
  ]);
  assert.ok(messages.every(x => x.kind === 'link'));
});

test('Actual menu links with their own page are supported; menu trigger stays native', () => {
  const { listeners, messages } = setupContent();
  const anchor = new MockElement('a', { href: '/plugins' });
  new MockElement('div', { role: 'menuitem' }, [anchor]);
  listeners.click(mouse('click', anchor, { ctrlKey: true }));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].url, 'https://chatgpt.com/plugins');
  const trigger = new MockElement('button', { 'aria-haspopup': 'menu' });
  const event = mouse('auxclick', trigger, { button: 1 });
  listeners.auxclick(event);
  assert.equal(event.defaultPrevented, false);
  assert.equal(messages.length, 1);
});

test('Downloads, fragments, action URLs, external links and disabled anchors remain native', () => {
  const { listeners, messages } = setupContent('https://chatgpt.com/c/existing');
  const links = [
    { href: '/api/download?file=foo' },
    { href: '/library/file/xyz', download: '' },
    { href: '#menu' },
    { href: 'https://external.example/page' },
    { href: '/auth/logout' },
    { href: '/plugins', 'aria-disabled': 'true' }
  ];
  for (const attrs of links) {
    const anchor = new MockElement('a', attrs);
    const e = mouse('auxclick', anchor, { button: 1 });
    listeners.auxclick(e);
    assert.equal(e.defaultPrevented, false, JSON.stringify(attrs));
  }
  assert.equal(messages.length, 0);
});

test('Builtins and generic anchors are independently checked by the background worker', () => {
  const created = [];
  let onMessage;
  const chrome = {
    runtime: { lastError: null, onMessage: { addListener: fn => { onMessage = fn; } } },
    tabs: { create: (opts, callback) => { created.push(opts); callback({ id: created.length }); } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'background/navigation-tabs.js'), 'utf8'), { chrome, URL, Set });
  const sender = { url: 'https://chatgpt.com/c/current', tab: { id: 11, index: 2, windowId: 4 } };
  const open = (url, kind = 'sidebar-page') => {
    let response;
    const handled = onMessage({ type: 'cgpt-ui-open-navigation-tab', url, kind, active: false }, sender, r => { response = r; });
    return { handled, response };
  };
  for (const path of ['/library', '/scheduled', '/plugins']) {
    assert.equal(open(`https://chatgpt.com${path}`).handled, true);
  }
  for (const path of ['/library/folders/123', '/plugins?q=test', '/gpts/mine']) {
    assert.equal(open(`https://chatgpt.com${path}`, 'link').handled, true);
  }
  for (const [url, kind] of [
    ['https://chatgpt.com/pricing', 'sidebar-page'],
    ['https://chatgpt.com/plugins?q=forward', 'sidebar-page'],
    ['https://evil.example/library', 'link'],
    ['https://chatgpt.com.evil.example/plugins', 'link'],
    ['https://chatgpt.com/auth/logout', 'link'],
    ['https://chatgpt.com/api/action', 'link'],
    ['http://chatgpt.com/library', 'link'],
    ['https://chatgpt.com/?next=https://evil.example', 'link']
  ]) {
    assert.equal(open(url, kind).handled, false, `${kind}: ${url}`);
  }
  assert.equal(created.length, 6);
  assert.ok(created.every(x => x.active === false && x.index === 3 && x.windowId === 4));
});

test('Navigation and compatibility diagnostics expose the current extension version', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const probe = fs.readFileSync(path.join(root, 'content/compatibility-probe.js'), 'utf8');
  assert.match(probe, new RegExp(`extensionVersion: ["']${manifest.version.replace(/\./g, '\\.')}["']`));
  assert.match(manifest.description, /Library, Scheduled, Plugins/);
});
