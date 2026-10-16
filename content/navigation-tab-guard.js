/*
 * Restore native-style middle/Ctrl/Cmd-click navigation in ChatGPT.
 *
 * Installed at document_start, before ChatGPT's single-page navigation
 * handlers. Prefer actual anchors: their href remains the source of truth for
 * existing and future pages. Handle only verified, linkless navigation buttons
 * whose destination is explicitly identified by ChatGPT's sidebar DOM.
 * Ordinary clicks, menus, modal actions, downloads and external links remain
 * ChatGPT's/browser's responsibility.
 */
(function initNavigationTabGuard(global) {
  const NS = (global.CgptUiEnhancer = global.CgptUiEnhancer || {});
  const MESSAGE_TYPE = 'cgpt-ui-open-navigation-tab';
  const PROJECT_ID = /^g-p-[a-z0-9_-]+$/i;
  const CHAT_OR_PROJECT_ROUTE = /^\/(?:c\/[a-z0-9_-]+|g\/g-[a-z0-9_-]+\/c\/[a-z0-9_-]+|g\/g-p-[a-z0-9_-]+)\/?$/i;
  // These three values are present in the September 26 ChatGPT sidebar HTML.
  // They identify *navigation*, not menu commands. Do not infer destinations
  // for future unknown builtin values or from potentially translated labels.
  const BUILTIN_ROUTES = Object.freeze({
    'builtin:automations': '/scheduled',
    'builtin:library': '/library',
    'builtin:skills': '/plugins'
  });
  const BUILTIN_ROUTE = /^\/(?:scheduled|library|plugins)\/?$/i;
  const SIDEBAR_ROW = ".sidebar-item, [data-app-action-sidebar-project-row], li[class*='project-chat']";
  const NESTED_CONTROL = "button, a, input, textarea, select, [contenteditable='true'], [role='menuitem'], [role='menuitemcheckbox'], [role='menuitemradio'], [aria-haspopup='menu']";
  const PROJECT_ROW = '[data-app-action-sidebar-project-row][data-app-action-sidebar-project-id]';
  const PROJECT_CONTAINER = "[data-sidebar-project-container-id^='project:'][data-sidebar-project-kind]";
  const NEW_CHAT_IN_PROJECT = /^New chat in\s+\S/i;
  // Explicit native hyperlinks can lead to more pages than the builtins.
  // Do not intercept auth/API/action endpoints, which might produce side effects.
  const ACTION_PATH = /^\/(?:api|backend(?:-api)?|public-api|auth|oauth|sso|logout|redirect|cdn-cgi)(?:\/|$)/i;
  let handledCount = 0;
  let lastKind = null;
  let enabled = true;

  try {
    global.chrome.storage.local.get('cgptUi_enabled', function (values) {
      if (!global.chrome.runtime.lastError) enabled = values.cgptUi_enabled !== false;
    });
    global.chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === 'local' && changes.cgptUi_enabled) enabled = changes.cgptUi_enabled.newValue !== false;
    });
  } catch (_) { /* Keep enabled by default when storage is unavailable. */ }

  function elementTarget(target) {
    return target instanceof Element ? target : target && target.parentElement instanceof Element ? target.parentElement : null;
  }

  function trustedUrl(candidate) {
    try {
      const url = new URL(candidate, global.location.href);
      if (url.protocol !== 'https:' || (url.hostname !== 'chatgpt.com' && url.hostname !== 'chat.openai.com')) return null;
      if (url.username || url.password || url.port) return null;
      return url;
    } catch (_) { return null; }
  }

  function validUrl(candidate, source = 'synthetic') {
    const url = trustedUrl(candidate);
    if (!url) return null;
    if (source === 'anchor') {
      // Only actual same-site <a href> elements get general page support;
      // buttons never receive arbitrary URLs inferred from labels.
      if (ACTION_PATH.test(url.pathname)) return null;
      if (url.pathname === '/' && (url.search || url.hash)) return null;
      return url.href;
    }
    // Strict allowlist for synthetic sidebar targets and new-chat actions.
    if (url.pathname === '/') return !url.search && !url.hash ? url.href : null;
    if (BUILTIN_ROUTE.test(url.pathname)) return !url.search && !url.hash ? url.href : null;
    return CHAT_OR_PROJECT_ROUTE.test(url.pathname) ? url.href : null;
  }

  function isNestedControl(target, row) {
    for (let node = target; node && node !== row; node = node.parentElement) {
      if (node.matches(NESTED_CONTROL)) return true;
    }
    return false;
  }

  function projectIdForRow(target) {
    const row = target.closest(PROJECT_ROW);
    if (row) {
      const id = row.getAttribute('data-app-action-sidebar-project-id') || '';
      return PROJECT_ID.test(id) ? id : null;
    }
    const container = target.closest(PROJECT_CONTAINER);
    if (!container) return null;
    const fallbackRow = target.closest(".sidebar-item[role='button']");
    if (!fallbackRow || !container.contains(fallbackRow)) return null;
    const id = (container.getAttribute('data-sidebar-project-container-id') || '').slice('project:'.length);
    return PROJECT_ID.test(id) ? id : null;
  }

  function projectUrl(target) {
    const row = target.closest(PROJECT_ROW) || target.closest(".sidebar-item[role='button']");
    if (!row || isNestedControl(target, row)) return null;
    const id = projectIdForRow(target);
    return id ? validUrl('/g/' + id) : null;
  }

  function navigationButtonDestination(target) {
    const button = target.closest('button');
    if (!button || button.disabled || button.getAttribute('disabled') !== null || button.getAttribute('aria-disabled') === 'true') return null;

    let label = (button.getAttribute('aria-label') || button.getAttribute('title') || '').trim();
    if (!label && button.matches('.sidebar-item') && button.closest('#app-shell-sidebar, #stage-slideover-sidebar')) {
      if ((button.textContent || '').replace(/\s+/g, ' ').trim() === 'New chat') label = 'New chat';
    }
    if (label === 'New chat' || NEW_CHAT_IN_PROJECT.test(label)) {
      const id = projectIdForRow(button);
      if (id) return { url: validUrl('/g/' + id), kind: 'project-new-chat', nativeAnchor: false };
      // Never redirect an orphaned Project pencil icon to a global new chat.
      if (label !== 'New chat') return null;
      return { url: validUrl('/'), kind: 'new-chat', nativeAnchor: false };
    }

    // ChatGPT's expanded AND collapsed sidebar represent these as buttons
    // with stable data-sidebar-destination identifiers but no href. Intercept
    // only real sidebar navigation buttons, never similarly named dialogs.
    if (!button.matches('.sidebar-item') || !button.closest('#app-shell-sidebar, #stage-slideover-sidebar')) return null;
    const builtin = button.getAttribute('data-sidebar-destination');
    if (!Object.hasOwn(BUILTIN_ROUTES, builtin)) return null;
    return { url: validUrl(BUILTIN_ROUTES[builtin]), kind: 'sidebar-page', nativeAnchor: false };
  }

  function destination(target) {
    if (!target || target.closest('#cgpt-theme-builder, .cgpt-theme-builder-panel, [contenteditable="true"]')) return null;

    // Native anchors already identify the actual URL, including links in
    // navigational popovers and future ChatGPT pages. Exclude download and
    // disabled links; leave external/native controls alone.
    const anchor = target.closest('a[href]');
    if (anchor) {
      const href = (anchor.getAttribute('href') || '').trim();
      if (!href || href.startsWith('#')) return null;
      if (anchor.getAttribute('download') !== null || anchor.getAttribute('aria-disabled') === 'true') return null;
      if (anchor.closest('button')) return null;
      const url = validUrl(href, 'anchor');
      return url ? { url, kind: 'link', nativeAnchor: true } : null;
    }

    const button = target.closest('button');
    if (button) {
      const page = navigationButtonDestination(target);
      return page && page.url ? page : null;
    }

    // Explore, account menus, section expanders and other UI-only controls
    // have no independent page and must continue to behave normally.
    if (target.closest("[aria-haspopup='menu'], [role='menuitem'], [role='menuitemcheckbox'], [role='menuitemradio']")) return null;

    const project = projectUrl(target);
    if (project) return { url: project, kind: 'project', nativeAnchor: false };

    // Sidebar padding beside a single real chat link acts like that link.
    const row = target.closest(SIDEBAR_ROW);
    if (!row || isNestedControl(target, row)) return null;
    const links = row.querySelectorAll('a[href]');
    let match = null;
    for (const link of links) {
      const href = (link.getAttribute('href') || '').trim();
      if (!href || href.startsWith('#') || link.getAttribute('download') !== null || link.getAttribute('aria-disabled') === 'true') continue;
      const url = validUrl(link.getAttribute('href'), 'anchor');
      if (!url) continue;
      if (match) return null; // Ambiguous row: do not guess.
      match = { url, kind: 'chat-row', nativeAnchor: false };
    }
    return match;
  }

  function openInTab(dest, foreground) {
    try {
      if (global.chrome && global.chrome.runtime && typeof global.chrome.runtime.sendMessage === 'function') {
        global.chrome.runtime.sendMessage({ type: MESSAGE_TYPE, url: dest.url, kind: dest.kind, active: foreground }, function (result) {
          if (global.chrome.runtime.lastError || !result || !result.ok) {
            // If the service worker is unavailable, preserve the user's click.
            global.open(dest.url, '_blank', 'noopener');
          }
        });
        return;
      }
    } catch (_) { /* Try a native window as a best-effort fallback. */ }
    global.open(dest.url, '_blank', 'noopener');
  }

  function onModifiedClick(event) {
    if (!enabled || !event.isTrusted || event.defaultPrevented || event.altKey) return;
    const middle = event.type === 'auxclick' && event.button === 1;
    const modifiedPrimary = event.type === 'click' && event.button === 0 && (event.ctrlKey || event.metaKey);
    if (!middle && !modifiedPrimary) return;
    const dest = destination(elementTarget(event.target));
    if (!dest) return;
    event.preventDefault();
    event.stopImmediatePropagation(); // Prevent navigating the original tab.
    handledCount += 1;
    lastKind = dest.kind;
    openInTab(dest, !!event.shiftKey);
  }

  function onMouseDown(event) {
    if (!enabled || !event.isTrusted || event.button !== 1 || event.altKey || event.defaultPrevented) return;
    const dest = destination(elementTarget(event.target));
    // Prevent autoscroll on linkless button/row destinations only.
    if (dest && !dest.nativeAnchor) event.preventDefault();
  }

  global.addEventListener('mousedown', onMouseDown, true);
  global.addEventListener('click', onModifiedClick, true);
  global.addEventListener('auxclick', onModifiedClick, true);
  NS.getNavigationTabGuardReport = function () {
    return { installed: true, enabled, handledCount, lastKind };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
