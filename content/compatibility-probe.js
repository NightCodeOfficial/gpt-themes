/*
 * Lightweight ChatGPT DOM compatibility probe.
 *
 * This does not modify ChatGPT. It exposes a live diagnostic report through
 * CgptUiEnhancer.getCompatibilityReport() so selector drift can be identified
 * quickly after future UI rollouts.
 */
(function initCompatibilityProbe(global) {
  const NS = (global.CgptUiEnhancer = global.CgptUiEnhancer || {});

  function first(selectors) {
    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el) return el;
      } catch (_) {}
    }
    return null;
  }

  function count(selector) {
    try { return document.querySelectorAll(selector).length; } catch (_) { return 0; }
  }

  function visible(el) {
    if (!(el instanceof Element)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    try {
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    } catch (_) {
      return false;
    }
  }

  function scan() {
    const composerRoot = first(NS.COMPOSER_ROOT_SELECTORS || [
      "form[data-type='unified-composer']",
      "form[data-chatgpt-composer]",
      "[data-testid='composer-root']",
      "#thread-bottom-container",
      "#thread-bottom"
    ]);
    const editor = first([
      "#prompt-textarea",
      "form[data-chatgpt-composer] [contenteditable='true']",
      "form[data-chatgpt-composer] textarea",
      "form[data-type='unified-composer'] [contenteditable='true']",
      "form[data-type='unified-composer'] textarea",
      "[data-testid='composer-root'] [contenteditable='true']",
      "[data-testid='composer-root'] textarea"
    ]);
    const sidebar = first(NS.SIDEBAR_SELECTORS || [
      "#stage-slideover-sidebar",
      "#stage-sidebar-tiny-bar",
      "#stage-popover-sidebar",
      "#app-shell-sidebar",
      "nav[data-app-navigation-rail='true']",
      "nav[aria-label='Chat history']"
    ]);

    const report = {
      extensionVersion: "0.8.31",
      checkedAt: new Date().toISOString(),
      route: location.pathname + location.search,
      composer: {
        root: !!composerRoot,
        rootType: composerRoot ? (composerRoot.getAttribute("data-type") || composerRoot.getAttribute("data-testid") || composerRoot.id || composerRoot.tagName.toLowerCase()) : null,
        editor: !!editor,
        editorVisible: visible(editor),
        sendButton: !!first([
          "form[data-chatgpt-composer] button[aria-label='Send']",
          "form[data-chatgpt-composer] button[aria-label='Send message']",
          "button[data-testid='send-button']",
          "button[aria-label='Send prompt']",
          "button[aria-label='Send dictated message']",
          "#composer-submit-button"
        ]),
        plusButton: !!first([
          "[data-testid='composer-plus-btn']",
          "button[aria-label='Add files and more']"
        ]),
        surface: !!first([
          "form[data-chatgpt-composer] [data-composer-surface-variant][data-composer-radius-variant]",
          "form[data-type='unified-composer'] [data-composer-surface]",
          "[data-testid='composer-root'] [data-composer-surface]",
          "[data-composer-surface]"
        ])
      },
      sidebar: {
        any: !!sidebar,
        expanded: !!document.getElementById("stage-slideover-sidebar"),
        collapsedRail: !!document.getElementById("stage-sidebar-tiny-bar"),
        popover: !!document.getElementById("stage-popover-sidebar"),
        appShell: !!document.getElementById("app-shell-sidebar"),
        appShellBrand: !!first(["#app-shell-sidebar .sidebar-navigation .h-toolbar svg[role='img']"]),
        appShellRail: !!first(["nav[data-app-navigation-rail='true']"]),
        chatHistoryNav: !!first(["nav[aria-label='Chat history']", "nav[aria-label*='Chat history' i]"])
      },
      conversation: {
        turns: count("[data-testid^='conversation-turn'], article[data-turn]"),
        userMessages: count("[data-message-author-role='user']"),
        assistantMessages: count("[data-message-author-role='assistant']")
      },
      currentUi: {
        chatWorkTabs: count("main [role='tablist'] [role='tab']"),
        appShellTitlebar: !!first(["main header[data-app-shell-titlebar='true']"]),
        appShellTitlebarBackground: (function () {
          const titlebar = first(["main header[data-app-shell-titlebar='true']"]);
          return titlebar ? window.getComputedStyle(titlebar).backgroundImage : null;
        })(),
        transientMenus: count('[role="menu"], [role="listbox"], [data-content-appearance="touch-optimized"], [data-radix-menu-content], [data-radix-dropdown-menu-content], [data-radix-popover-content], [data-side]:has(.__menu-item), [role="dialog"]:has(.__menu-item)'),
        openNativePopovers: count('[popover]:popover-open:not([popover="hint"])'),
        navigationTabGuard: NS.getNavigationTabGuardReport ? NS.getNavigationTabGuardReport() : { installed: false },
        guardedMenuSurfaces: count('.cgpt-ui-menu-surface'),
        semanticFencedCodeBlocks: count('[data-markdown-copy="code-block"]'),
        legacyFencedCodeBlocks: count('[data-message-author-role="assistant"] pre, .markdown pre'),
        fencedCodeBlocks: (function () {
          const guardReport = NS.getCodeBlockGuardReport ? NS.getCodeBlockGuardReport() : null;
          if (guardReport && Number.isFinite(guardReport.fencedBlockCount)) return guardReport.fencedBlockCount;
          const semantic = count('[data-markdown-copy="code-block"]');
          return semantic || count('[data-message-author-role="assistant"] pre, .markdown pre');
        })(),
        guardedCodeBlockShells: count('.cgpt-code-block-shell'),
        codeBlockGuardReport: NS.getCodeBlockGuardReport ? NS.getCodeBlockGuardReport() : { installed: false },
        sidebarMenuSurfaceFalsePositives: count('#stage-slideover-sidebar .cgpt-ui-menu-surface, #stage-slideover-sidebar.cgpt-ui-menu-surface, #stage-sidebar-tiny-bar.cgpt-ui-menu-surface, #stage-popover-sidebar .cgpt-ui-menu-surface, #stage-popover-sidebar.cgpt-ui-menu-surface, #app-shell-sidebar .cgpt-ui-menu-surface, #app-shell-sidebar.cgpt-ui-menu-surface, nav[data-app-navigation-rail="true"].cgpt-ui-menu-surface'),
        menuSurfaceReport: NS.getLastMenuSurfaceReport ? NS.getLastMenuSurfaceReport() : [],
        threadScrollFooter: !!first(["[data-thread-scroll-footer='true']"]),
        threadDisclaimer: !!first(['[data-testid="thread-disclaimer"]'])
      }
    };

    report.coreSelectorsHealthy = !!report.composer.editor;
    NS.lastCompatibilityReport = report;
    return report;
  }

  NS.getCompatibilityReport = scan;
  NS.refreshCompatibilityReport = scan;
})(typeof globalThis !== "undefined" ? globalThis : this);
