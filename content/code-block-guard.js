/*
 * GPT Themes code-block surface guard.
 *
 * ChatGPT periodically changes the wrapper hierarchy around rendered fenced
 * code blocks. Newer builds expose a stable data-markdown-copy="code-block"
 * surface and may no longer render a <pre> element at all. Older builds still
 * use semantic <pre>/<code> nodes. This guard supports both layouts and only
 * marks existing native nodes so GPT Themes never replaces ChatGPT's renderer,
 * toolbar, scrolling, selection, or copy behavior.
 */
(function initCodeBlockGuard(global) {
  const NS = (global.CgptUiEnhancer = global.CgptUiEnhancer || {});

  const SHELL_CLASS = "cgpt-code-block-shell";
  const BODY_CLASS = "cgpt-code-block-body";
  const HEADER_CLASS = "cgpt-code-block-header";
  const PRE_CLASS = "cgpt-code-block-pre";
  const CODE_CLASS = "cgpt-code-block-code";
  const SEMANTIC_SHELL_SELECTOR = '[data-markdown-copy="code-block"]';
  const SEMANTIC_HEADER_SELECTOR = '[data-markdown-copy="exclude"]';

  const MESSAGE_BOUNDARY_SELECTOR = [
    "[data-message-author-role]",
    "[data-testid^='conversation-turn']",
    "article[data-turn]"
  ].join(",");

  const CONVERSATION_SCOPE_SELECTOR = [
    "[data-message-author-role='assistant']",
    "[data-markdown-text-style='assistant-message']",
    ".markdown",
    "main"
  ].join(",");

  const CONTROL_SELECTOR = [
    "button",
    "[role='button']",
    "[data-testid*='copy' i]",
    "[aria-label*='copy' i]",
    "[title*='copy' i]"
  ].join(",");

  let observer = null;
  let scheduled = false;
  let lastReport = {
    installed: false,
    fencedBlockCount: 0,
    semanticBlockCount: 0,
    legacyPreCount: 0,
    fencedPreCount: 0,
    guardedShellCount: 0,
    fallbackCount: 0,
    lastScanAt: null
  };

  function isElement(value) {
    return typeof Element !== "undefined" && value instanceof Element;
  }

  function safeMatches(el, selector) {
    try { return !!el && el.matches(selector); } catch (_) { return false; }
  }

  function safeClosest(el, selector) {
    try { return el && el.closest(selector); } catch (_) { return null; }
  }

  function queryAll(root, selector) {
    try { return Array.from(root.querySelectorAll(selector)); } catch (_) { return []; }
  }

  function contains(ancestor, node) {
    try { return ancestor === node || ancestor.contains(node); } catch (_) { return false; }
  }

  function inThemeBuilder(el) {
    return !!safeClosest(el, "#cgpt-theme-builder, .cgpt-theme-builder-panel, .cgpt-theme-builder-modal");
  }

  function inConversation(el) {
    return isElement(el) && !inThemeBuilder(el) && !!safeClosest(el, CONVERSATION_SCOPE_SELECTOR);
  }

  function isConversationPre(pre) {
    return isElement(pre) && pre.tagName === "PRE" && inConversation(pre);
  }

  function isSemanticCodeShell(shell) {
    return isElement(shell) && safeMatches(shell, SEMANTIC_SHELL_SELECTOR) && inConversation(shell);
  }

  function controlsOutsideNode(candidate, contentNode) {
    return queryAll(candidate, CONTROL_SELECTOR).filter(function (control) {
      return !contains(contentNode, control);
    });
  }

  function countDescendantPre(candidate) {
    return queryAll(candidate, "pre").length;
  }

  function isMessageBoundary(el) {
    return safeMatches(el, MESSAGE_BOUNDARY_SELECTOR);
  }

  function hasSiblingBranchAroundNode(candidate, contentNode) {
    const children = Array.from(candidate.children || []);
    if (children.length < 2) return false;
    let contentBranch = null;
    for (const child of children) {
      if (contains(child, contentNode)) {
        contentBranch = child;
        break;
      }
    }
    if (!contentBranch) return false;
    return children.some(function (child) {
      return child !== contentBranch;
    });
  }

  function classHintLooksLikeCodeSurface(candidate) {
    const className = typeof candidate.className === "string" ? candidate.className : "";
    return /(?:rounded|border|overflow|surface|code|contain|bg-)/i.test(className);
  }

  function findLegacyShell(pre) {
    let node = pre.parentElement;
    let fallback = null;

    for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
      if (isMessageBoundary(node)) break;
      if (safeMatches(node, "html, body, main, .markdown")) break;
      if (countDescendantPre(node) !== 1) continue;

      const controls = controlsOutsideNode(node, pre);
      if (controls.length > 0 && hasSiblingBranchAroundNode(node, pre)) {
        return { shell: node, fallback: false };
      }

      // Fallback for legacy renderers that move the copy control elsewhere.
      // Keep this narrow so an entire assistant message can never be promoted.
      if (!fallback && depth <= 4 && hasSiblingBranchAroundNode(node, pre) && classHintLooksLikeCodeSurface(node)) {
        fallback = node;
      }
    }

    return fallback ? { shell: fallback, fallback: true } : { shell: null, fallback: false };
  }

  function clearMarkers(root) {
    if (!root || typeof root.querySelectorAll !== "function") return;
    queryAll(root, "." + SHELL_CLASS + ", ." + BODY_CLASS + ", ." + HEADER_CLASS + ", ." + PRE_CLASS + ", ." + CODE_CLASS)
      .forEach(function (el) {
        el.classList.remove(SHELL_CLASS, BODY_CLASS, HEADER_CLASS, PRE_CLASS, CODE_CLASS);
      });
  }

  function markContentPath(shell, contentNode) {
    let node = contentNode && contentNode.parentElement;
    while (node && node !== shell) {
      node.classList.add(BODY_CLASS);

      // Header/toolbars can live as siblings at any level of the content path.
      for (const sibling of Array.from(node.parentElement ? node.parentElement.children : [])) {
        if (sibling === node || contains(sibling, contentNode)) continue;
        if (safeMatches(sibling, SEMANTIC_HEADER_SELECTOR) || queryAll(sibling, CONTROL_SELECTOR).length > 0) {
          sibling.classList.add(HEADER_CLASS);
        }
      }
      node = node.parentElement;
    }
  }

  function markShellChildren(shell, contentNode) {
    for (const child of Array.from(shell.children || [])) {
      if (contentNode && contains(child, contentNode)) {
        child.classList.add(BODY_CLASS);
        continue;
      }
      if (safeMatches(child, SEMANTIC_HEADER_SELECTOR) || safeMatches(child, CONTROL_SELECTOR) || queryAll(child, CONTROL_SELECTOR).length > 0) {
        child.classList.add(HEADER_CLASS);
      }
    }
  }

  function markSemanticCodeBlock(shell) {
    if (!isSemanticCodeShell(shell)) return false;

    shell.classList.add(SHELL_CLASS);
    const pre = shell.querySelector ? shell.querySelector("pre") : null;
    const code = shell.querySelector ? shell.querySelector("code") : null;

    if (isElement(pre)) pre.classList.add(PRE_CLASS);
    if (isElement(code)) code.classList.add(CODE_CLASS);

    // Current ChatGPT can render fenced code as shell > scrollport > code with
    // no <pre>. Prefer the code element as the content anchor in that layout.
    const contentNode = isElement(pre) ? pre : code;
    if (isElement(contentNode)) markContentPath(shell, contentNode);
    markShellChildren(shell, contentNode);
    return true;
  }

  function markLegacyCodeBlock(pre) {
    pre.classList.add(PRE_CLASS);
    const code = pre.querySelector ? pre.querySelector("code") : null;
    if (isElement(code)) code.classList.add(CODE_CLASS);

    const result = findLegacyShell(pre);
    if (!result.shell) return result;

    result.shell.classList.add(SHELL_CLASS);
    markContentPath(result.shell, pre);
    markShellChildren(result.shell, pre);
    return result;
  }

  function scan(root) {
    const scanRoot = root && typeof root.querySelectorAll === "function" ? root : document;
    const semanticShells = queryAll(scanRoot, SEMANTIC_SHELL_SELECTOR).filter(isSemanticCodeShell);
    let shells = 0;
    let fallbacks = 0;

    for (const shell of semanticShells) {
      if (markSemanticCodeBlock(shell)) shells += 1;
    }

    // Legacy fallback: process only <pre> blocks that were not already inside
    // a current semantic code-block shell.
    const legacyPreNodes = queryAll(scanRoot, "pre").filter(function (pre) {
      return isConversationPre(pre) && !safeClosest(pre, SEMANTIC_SHELL_SELECTOR);
    });

    for (const pre of legacyPreNodes) {
      const result = markLegacyCodeBlock(pre);
      if (result.shell) shells += 1;
      if (result.fallback) fallbacks += 1;
    }

    lastReport = {
      installed: true,
      fencedBlockCount: semanticShells.length + legacyPreNodes.length,
      semanticBlockCount: semanticShells.length,
      legacyPreCount: legacyPreNodes.length,
      // Retained for compatibility with v0.8.28 diagnostics consumers.
      fencedPreCount: legacyPreNodes.length,
      guardedShellCount: shells,
      fallbackCount: fallbacks,
      lastScanAt: new Date().toISOString()
    };
    return lastReport;
  }

  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    const run = function () {
      scheduled = false;
      scan(document);
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  function start() {
    if (observer || typeof document === "undefined") return;
    scan(document);
    if (typeof MutationObserver === "function" && document.documentElement) {
      observer = new MutationObserver(scheduleScan);
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  NS.refreshCodeBlockGuards = function refreshCodeBlockGuards() { return scan(document); };
  NS.getCodeBlockGuardReport = function getCodeBlockGuardReport() { return Object.assign({}, lastReport); };
  NS.clearCodeBlockGuards = function clearCodeBlockGuards() { clearMarkers(document); };

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
