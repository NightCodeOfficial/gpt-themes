/* Create adjacent tabs for verified ChatGPT navigation only. */
const OPEN_NAVIGATION_TAB = 'cgpt-ui-open-navigation-tab';
const TRUSTED_HOSTS = new Set(['chatgpt.com', 'chat.openai.com']);
const SYNTHETIC_ROUTE = /^\/(?:c\/[a-z0-9_-]+|g\/g-[a-z0-9_-]+\/c\/[a-z0-9_-]+|g\/g-p-[a-z0-9_-]+|scheduled|library|plugins)\/?$/i;
const ACTION_PATH = /^\/(?:api|backend(?:-api)?|public-api|auth|oauth|sso|logout|redirect|cdn-cgi)(?:\/|$)/i;

function trustedHttpsUrl(value, kind) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !TRUSTED_HOSTS.has(url.hostname)) return null;
    if (url.username || url.password || url.port) return null;
    if (kind === 'link' || kind === 'chat-row') {
      // Native hrefs are the page's own declared links: support new/future
      // ChatGPT page routes, but never request action/auth/API endpoints.
      if (ACTION_PATH.test(url.pathname)) return null;
      if (url.pathname === '/' && (url.search || url.hash)) return null;
      return url;
    }
    if (url.pathname === '/') return !url.search && !url.hash ? url : null;
    if (!SYNTHETIC_ROUTE.test(url.pathname)) return null;
    if (/^\/(?:library|scheduled|plugins)\/?$/i.test(url.pathname) && (url.search || url.hash)) return null;
    return url;
  } catch (_) { return null; }
}

chrome.runtime.onMessage.addListener(function (message, sender, respond) {
  if (!message || message.type !== OPEN_NAVIGATION_TAB) return false;
  const senderUrl = (function () {
    try {
      const url = new URL(sender && sender.url);
      return url.protocol === 'https:' && TRUSTED_HOSTS.has(url.hostname) && !url.username && !url.password && !url.port ? url : null;
    } catch (_) { return null; }
  })();
  const destination = trustedHttpsUrl(message.url, message.kind);
  if (!senderUrl || !destination || !sender.tab || typeof sender.tab.id !== 'number') {
    respond({ ok: false });
    return false;
  }

  const options = { url: destination.href, active: message.active === true };
  if (typeof sender.tab.windowId === 'number') options.windowId = sender.tab.windowId;
  if (Number.isInteger(sender.tab.index) && sender.tab.index >= 0) options.index = sender.tab.index + 1;
  chrome.tabs.create(options, function (tab) {
    respond({ ok: !chrome.runtime.lastError && !!tab });
  });
  return true;
});
