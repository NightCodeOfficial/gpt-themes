/*
 * Composer caret guard
 *
 * ChatGPT owns the composer and normally keeps its caret in view. This small
 * defensive layer only intervenes after an edit when the browser reports that
 * the active, collapsed caret has moved outside the visible scroll area. It
 * deliberately never runs on ordinary scroll events, so reading earlier text
 * in a long draft remains possible.
 */
(function initComposerCaretGuard(global) {
  const NS = (global.CgptUiEnhancer = global.CgptUiEnhancer || {});
  let started = false;
  let frameId = 0;
  let delayedIds = [];
  const COMPOSER_ROOT_SELECTORS = NS.COMPOSER_ROOT_SELECTORS || [
    "form[data-type='unified-composer']",
    "form[data-chatgpt-composer]",
    "[data-testid='composer-root']",
    "#thread-bottom-container",
    "#thread-bottom"
  ];

  function closestComposerRoot(node) {
    if (!(node instanceof Element)) return null;
    for (const selector of COMPOSER_ROOT_SELECTORS) {
      try {
        const root = node.closest(selector);
        if (root) return root;
      } catch (_) {}
    }
    return null;
  }

  function getComposerEditor(node) {
    if (!(node instanceof Element)) return null;
    const editor = node.closest("#prompt-textarea, textarea, [contenteditable='true']");
    if (!editor) return null;
    const isNativeComposer = editor.id === "prompt-textarea" || !!closestComposerRoot(editor);
    return isNativeComposer ? editor : null;
  }

  function isActiveCaretIn(editor) {
    if (editor instanceof HTMLTextAreaElement) {
      return document.activeElement === editor && editor.selectionStart === editor.selectionEnd;
    }
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return false;
    const node = selection.anchorNode;
    return !!node && (node === editor || editor.contains(node));
  }

  function getCaretRect(editor) {
    if (editor instanceof HTMLTextAreaElement) return null;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    return rect && (rect.height || rect.width) ? rect : null;
  }

  function getScrollParents(editor) {
    const parents = [];
    let node = editor;
    const stopAt = closestComposerRoot(editor);
    while (node && node instanceof HTMLElement) {
      const style = window.getComputedStyle(node);
      const canScroll = node.scrollHeight > node.clientHeight + 1 &&
        /auto|scroll|overlay/.test(style.overflowY || "");
      if (canScroll) parents.push(node);
      if (node === stopAt) break;
      node = node.parentElement;
    }
    return parents;
  }

  function revealCaret(editor) {
    if (!editor || !editor.isConnected || !isActiveCaretIn(editor)) return;

    if (editor instanceof HTMLTextAreaElement) {
      // A textarea does not expose caret geometry. Only take it to the bottom
      // when the caret is at the end of the draft, which is the paste/append
      // case this guard is intended to repair.
      if (editor.selectionEnd === editor.value.length && editor.scrollHeight > editor.clientHeight) {
        editor.scrollTop = editor.scrollHeight;
      }
      return;
    }

    const parents = getScrollParents(editor);
    parents.forEach(function (parent) {
      const caret = getCaretRect(editor);
      if (!caret) return;
      const bounds = parent.getBoundingClientRect();
      const padding = 8;
      if (caret.bottom > bounds.bottom - padding) {
        parent.scrollTop += caret.bottom - (bounds.bottom - padding);
      } else if (caret.top < bounds.top + padding) {
        parent.scrollTop -= (bounds.top + padding) - caret.top;
      }
    });
  }

  function clearPending() {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    delayedIds.forEach(function (id) { clearTimeout(id); });
    delayedIds = [];
  }

  function scheduleReveal(event) {
    const editor = getComposerEditor(event.target);
    if (!editor) return;
    clearPending();
    frameId = requestAnimationFrame(function () {
      frameId = 0;
      revealCaret(editor);
    });
    // ChatGPT may resize its composer in a later task after a large paste.
    // Recheck a few times without installing a mutation observer or touching layout.
    delayedIds = [50, 180, 360].map(function (delay) {
      return setTimeout(function () { revealCaret(editor); }, delay);
    });
  }

  function start() {
    if (started) return;
    started = true;
    document.addEventListener("input", scheduleReveal, true);
    document.addEventListener("paste", scheduleReveal, true);
    document.addEventListener("compositionend", scheduleReveal, true);
  }

  function stop() {
    if (!started) return;
    started = false;
    clearPending();
    document.removeEventListener("input", scheduleReveal, true);
    document.removeEventListener("paste", scheduleReveal, true);
    document.removeEventListener("compositionend", scheduleReveal, true);
  }

  NS.applyComposerCaretGuard = function applyComposerCaretGuard(state) {
    if (state && state.enabled) start(); else stop();
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
