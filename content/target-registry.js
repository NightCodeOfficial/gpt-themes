
/* GPTT_084_USER_BUBBLE_DEFAULT_PATCH */
function gpttForceUserBubbleTransparentDefault(theme) {
  if (!theme || typeof theme !== "object") return theme;
  const paths = [
    ["core", "userBubble"],
    ["coreColors", "userBubble"],
    ["colors", "userBubble"],
    ["colors", "userBubbleSurface"],
    ["colors", "userBubbleBackground"],
    ["theme", "userBubble"]
  ];
  for (const path of paths) {
    let node = theme;
    for (const key of path.slice(0, -1)) {
      if (!node || typeof node !== "object") { node = null; break; }
      node = node[key];
    }
    if (!node || typeof node !== "object") continue;
    const leaf = node[path[path.length - 1]];
    if (leaf && typeof leaf === "object") {
      if ("opacity" in leaf) leaf.opacity = 0;
      if ("alpha" in leaf) leaf.alpha = 0;
      if ("transparency" in leaf) leaf.transparency = 1;
      if ("transparent" in leaf) leaf.transparent = true;
      if ("isTransparent" in leaf) leaf.isTransparent = true;
    }
  }
  // Common flat fields
  ["userBubbleOpacity", "userBubbleAlpha", "userBubbleSurfaceOpacity", "userBubbleBackgroundOpacity"].forEach(k => {
    if (k in theme) theme[k] = 0;
  });
  ["userBubbleTransparency", "userBubbleSurfaceTransparency", "userBubbleBackgroundTransparency"].forEach(k => {
    if (k in theme) theme[k] = 1;
  });
  return theme;
}

(function initTargetRegistry(global) {
  const NS = (global.CgptUiEnhancer = global.CgptUiEnhancer || {});
  const SIDEBAR_SELECTORS = NS.SIDEBAR_SELECTORS || [
    "#stage-slideover-sidebar",
    "#stage-sidebar-tiny-bar",
    "#stage-popover-sidebar",
    "#app-shell-sidebar",
    "nav[data-app-navigation-rail='true']",
    "nav[aria-label='Chat history']"
  ];
  const COMPOSER_ROOT_SELECTORS = NS.COMPOSER_ROOT_SELECTORS || [
    "form[data-type='unified-composer']",
    "form[data-chatgpt-composer]",
    "[data-testid='composer-root']",
    "#thread-bottom-container",
    "#thread-bottom"
  ];
  const HEADER_SELECTORS = [
    "#page-header",
    "main header[data-app-shell-titlebar='true']",
    "main header",
    "main [data-testid='sticky-header']"
  ];

  function matches(el, selector) {
    try { return el instanceof Element && el.matches(selector); } catch (_) { return false; }
  }
  function closest(el, selectors) {
    if (!(el instanceof Element)) return null;
    for (const selector of selectors) {
      try {
        const found = el.closest(selector);
        if (found) return found;
      } catch (_) {}
    }
    return null;
  }
  function queryAll(selectors, root) {
    const scope = root || document;
    const out = [];
    const seen = new Set();
    selectors.forEach(function (selector) {
      try {
        scope.querySelectorAll(selector).forEach(function (el) {
          if (el instanceof Element && !seen.has(el)) { seen.add(el); out.push(el); }
        });
      } catch (_) {}
    });
    return out;
  }
  function visibleBox(el) {
    if (!(el instanceof Element)) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return null;
    return el;
  }
  function inSidebar(el) {
    return !!closest(el, SIDEBAR_SELECTORS);
  }
  function getSidebarRoot(el) {
    const fromElement = closest(el, SIDEBAR_SELECTORS);
    if (fromElement) return fromElement;
    for (const selector of SIDEBAR_SELECTORS) {
      try {
        const found = document.querySelector(selector);
        if (found) return found;
      } catch (_) {}
    }
    return null;
  }
  function inHeader(el) {
    return !!closest(el, HEADER_SELECTORS);
  }
  function inComposerDock(el) {
    return !!closest(el, ["#thread-bottom-container", "#thread-bottom", "[data-thread-scroll-footer='true']"]);
  }
  function inComposer(el) {
    return !!closest(el, COMPOSER_ROOT_SELECTORS);
  }
  function isSendButton(btn) {
    return matches(btn, "form[data-chatgpt-composer] button[aria-label='Send'], form[data-chatgpt-composer] button[aria-label='Send message'], button[data-testid='send-button'], button[aria-label='Send prompt'], button[aria-label='Send dictated message'], #composer-submit-button, button.composer-submit-btn");
  }
  function hasReadableSidebarText(el) {
    const text = (el && el.textContent || "").trim();
    return text.length > 0 && text.length < 80;
  }
  function sidebarItemSelectors() {
    return [
      "a",
      "button",
      "[role='button']",
      "[tabindex='0']",
      "[data-testid*='sidebar' i]",
      "[data-testid*='nav' i]",
      "[aria-label]"
    ];
  }
  function getSidebarItems(root) {
    const sidebar = root || getSidebarRoot(document.body);
    if (!sidebar) return [];
    const candidates = queryAll(sidebarItemSelectors(), sidebar)
      .filter(function (el) {
        if (!(el instanceof HTMLElement)) return false;
        if (closest(el, ["#cgpt-theme-builder", ".cgpt-theme-builder-panel", ".cgpt-theme-builder-toolbar"])) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 24 || r.height < 18 || r.height > 90) return false;
        if (!hasReadableSidebarText(el) && !el.querySelector("svg,img")) return false;
        const tag = el.tagName.toLowerCase();
        if (tag === "svg" || tag === "img") return false;
        return true;
      });

    // Remove nested duplicates. Keep the outer clickable row if it exists.
    return candidates.filter(function (el) {
      return !candidates.some(function (other) {
        return other !== el && other.contains(el) && other.getBoundingClientRect().height <= 96;
      });
    });
  }
  function findSidebarItem(el) {
    if (!inSidebar(el)) return null;
    const row = closest(el, sidebarItemSelectors());
    if (row && getSidebarItems(getSidebarRoot(el)).indexOf(row) !== -1) return row;
    // ChatGPT sometimes uses plain div rows. Walk up until a compact row is found.
    let cur = el;
    const sidebar = getSidebarRoot(el);
    while (cur && cur !== sidebar && cur instanceof Element) {
      const r = cur.getBoundingClientRect();
      if (r.width > 40 && r.height >= 22 && r.height <= 86 && hasReadableSidebarText(cur)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }
  function compactComposerFrom(root) {
    if (!(root instanceof Element)) return null;
    const input = closest(root, ["textarea", "[contenteditable='true']", "#prompt-textarea"]) || queryAll(["textarea", "[contenteditable='true']", "#prompt-textarea"], root)[0];
    const send = closest(root, ["form[data-chatgpt-composer] button[aria-label='Send']", "form[data-chatgpt-composer] button[aria-label='Send message']", "button[data-testid='send-button']", "button[aria-label='Send prompt']", "button[aria-label='Send dictated message']", "#composer-submit-button"]) || queryAll(["form[data-chatgpt-composer] button[aria-label='Send']", "form[data-chatgpt-composer] button[aria-label='Send message']", "button[data-testid='send-button']", "button[aria-label='Send prompt']", "button[aria-label='Send dictated message']", "#composer-submit-button"], root)[0];
    const anchors = [input, send, root].filter(Boolean);
    const candidates = [];
    anchors.forEach(function (anchor) {
      let cur = anchor instanceof Element ? anchor : null;
      let limit = 0;
      while (cur && cur !== document.body && limit < 10) {
        const r = cur.getBoundingClientRect();
        if (r.width >= 220 && r.width <= Math.min(window.innerWidth - 24, 980) && r.height >= 36 && r.height <= 140) {
          candidates.push(cur);
        }
        cur = cur.parentElement;
        limit += 1;
      }
    });
    if (!candidates.length) return null;
    const uniqueCandidates = Array.from(new Set(candidates));
    uniqueCandidates.sort(function (a, b) {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      const idealWidth = Math.min(window.innerWidth * 0.55, 820);
      const aScore = Math.abs(ar.height - 58) + Math.abs(ar.width - idealWidth) / 35;
      const bScore = Math.abs(br.height - 58) + Math.abs(br.width - idealWidth) / 35;
      return aScore - bScore;
    });
    return uniqueCandidates[0];
  }
  function composerSurface(el) {
    if (!(el instanceof Element)) return null;
    const composerRoot = closest(el, [
      "form[data-type='unified-composer']",
      "form[data-chatgpt-composer]",
      "[data-testid='composer-root']",
      "form:has(textarea)",
      "form:has([contenteditable='true'])",
      "form:has(button[data-testid='send-button'])",
      "form:has(#composer-submit-button)",
      "[class*='composer']:has(textarea)",
      "[class*='composer']:has([contenteditable='true'])"
    ]);
    const input = closest(el, ["textarea", "[contenteditable='true']", "#prompt-textarea", "[data-testid='composer-root'] [contenteditable='true']"]);
    if (input) return compactComposerFrom(input) || composerRoot || input;
    const send = closest(el, ["form[data-chatgpt-composer] button[aria-label='Send']", "form[data-chatgpt-composer] button[aria-label='Send message']", "button[data-testid='send-button']", "button[aria-label='Send prompt']", "button[aria-label='Send dictated message']", "#composer-submit-button", "button.composer-submit-btn"]);
    if (send) return compactComposerFrom(send) || composerRoot || send;
    if (composerRoot) return compactComposerFrom(el) || composerRoot;
    return null;
  }

  NS.THEME_TARGETS = [
    {
      id: "button.send",
      label: "Send button",
      description: "The submit arrow button in the composer.",
      fields: { background: "sendButtonBg", text: "sendButtonText", radius: "sendButtonRadiusPx" },
      selectors: ["form[data-chatgpt-composer] button[aria-label='Send']", "form[data-chatgpt-composer] button[aria-label='Send message']", "button[data-testid='send-button']", "button[aria-label='Send prompt']", "button[aria-label='Send dictated message']", "#composer-submit-button", "button.composer-submit-btn"],
      match: function (el) { return closest(el, this.selectors); }
    },
    {
      id: "composer.surface",
      label: "Composer surface",
      description: "The rounded outer composer shell around the prompt, model controls, and utility buttons.",
      fields: { background: "composerBg", border: "composerBorder", radius: "composerRadiusPx" },
      selectors: ["form[data-chatgpt-composer] [data-composer-surface-variant][data-composer-radius-variant]", "form[data-type='unified-composer'] [data-composer-surface]", "[data-testid='composer-root'] [data-composer-surface]", "[data-composer-surface]"],
      match: function (el) {
        // Let the dedicated input target handle editable descendants.
        if (closest(el, ["textarea", "[contenteditable='true']", "#prompt-textarea"])) return null;
        return closest(el, this.selectors);
      }
    },
    {
      id: "composer.input",
      label: "Composer text input",
      description: "The editable text field inside the composer.",
      fields: { background: "composerInputBg", text: "composerText" },
      selectors: [
        "form[data-chatgpt-composer] textarea",
        "form[data-chatgpt-composer] [contenteditable='true']",
        "form[data-type='unified-composer'] textarea",
        "form[data-type='unified-composer'] [contenteditable='true']",
        "[data-testid='composer-root'] textarea",
        "[data-testid='composer-root'] [contenteditable='true']",
        "#prompt-textarea"
      ],
      match: function (el) {
        if (!inComposer(el) && !closest(el, ["#prompt-textarea"])) return null;
        return closest(el, ["textarea", "[contenteditable='true']", "#prompt-textarea", "p"]);
      }
    },
    {
      id: "sidebar.logo",
      label: "Sidebar logo and icons",
      description: "The ChatGPT logo, sidebar row icons, and the collapse icon.",
      fields: { text: "sidebarIconColor" },
      selectors: [
        "#stage-slideover-sidebar svg",
        "#stage-sidebar-tiny-bar svg",
        "#stage-popover-sidebar svg",
        "#app-shell-sidebar svg",
        "nav[data-app-navigation-rail='true'] svg",
        "nav[aria-label='Chat history'] svg"
      ],
      match: function (el) {
        if (!inSidebar(el)) return null;
        const icon = closest(el, ["svg", "img"]);
        if (!icon) return null;
        const item = findSidebarItem(icon);
        if (item && hasReadableSidebarText(item)) return null;
        return icon;
      },
      getHighlightElements: function () {
        const root = getSidebarRoot(document.body);
        if (!root) return [];
        return queryAll(["svg", "img"], root).filter(function (icon) {
          const item = findSidebarItem(icon);
          return visibleBox(icon) && !(item && hasReadableSidebarText(item));
        });
      }
    },
    {
      id: "sidebar.item",
      label: "Sidebar items",
      description: "All sidebar navigation rows together: New chat, Search chats, Images, Apps, Deep research, Settings, Help, login, and similar rows.",
      fields: { background: "sidebarItemBg", text: "sidebarItemText", border: "sidebarItemBorder", radius: "sidebarItemRadiusPx" },
      selectors: sidebarItemSelectors(),
      match: function (el) { return findSidebarItem(el); },
      getHighlightElements: function () { return getSidebarItems(getSidebarRoot(document.body)); }
    },
    {
      id: "sidebar.main",
      label: "Sidebar background",
      description: "The left navigation area behind all sidebar items.",
      fields: { background: "sidebarBg", text: "sidebarText", border: "sidebarBorder" },
      selectors: SIDEBAR_SELECTORS,
      match: function (el) { return closest(el, this.selectors); }
    },
    {
      id: "mode.switcher",
      label: "Chat / Work switcher",
      description: "The current Chat / Work mode switcher and its tabs.",
      fields: { background: "secondaryButtonBg", text: "secondaryButtonText", border: "secondaryButtonBorder", radius: "secondaryButtonRadiusPx" },
      selectors: ["main [role='tablist']", "main [role='tab']"],
      match: function (el) {
        const tab = closest(el, ["[role='tab']"]);
        const list = tab ? tab.closest("[role='tablist']") : closest(el, ["[role='tablist']"]);
        if (!list || !list.closest("main") || !list.querySelector("[role='tab']")) return null;
        return tab || list;
      }
    },
    {
      id: "header.top",
      label: "Top header",
      description: "The main conversation top bar. The ChatGPT wordmark row in the left navigation is part of the sidebar, not this target.",
      fields: { background: "headerBg", text: "headerText", border: "headerBorder" },
      selectors: HEADER_SELECTORS,
      match: function (el) {
        if (inSidebar(el)) return null;
        return closest(el, this.selectors);
      }
    },
    {
      id: "bottom.dock",
      label: "Bottom composer dock",
      description: "The sticky bottom area behind the composer. Use this for the bottom fade/dock, not the rounded input bar.",
      fields: { background: "bottomDockBg", border: "bottomDockBorder" },
      selectors: ["#thread-bottom-container", "#thread-bottom", "[data-thread-scroll-footer='true']"],
      match: function (el) {
        if (composerSurface(el)) return null;
        return closest(el, this.selectors);
      }
    },
    {
      id: "chat.background",
      label: "Chat background",
      description: "The main conversation canvas. Supports solid color or an image background.",
      fields: { background: "chatAreaBg", text: "primaryText", image: true },
      selectors: ["main"],
      match: function (el) {
        if (inSidebar(el) || inHeader(el) || inComposerDock(el)) return null;
        return closest(el, ["main", "[role='main']", "[class*='thread']"]);
      }
    },
    {
      id: "assistant.message",
      label: "Assistant messages",
      description: "Assistant response text and its optional surface/background.",
      fields: { text: "assistantText", radius: "borderRadiusPx" },
      selectors: ["[data-message-author-role='assistant']"],
      match: function (el) { return closest(el, this.selectors); }
    },
    {
      id: "user.message",
      label: "User message bubbles",
      description: "The rounded message bubbles for your prompts.",
      fields: { background: "userBubbleBg", text: "userBubbleText", radius: "borderRadiusPx" },
      selectors: ["[data-message-author-role='user']"],
      match: function (el) { return closest(el, this.selectors); }
    },
    {
      id: "button.secondary",
      label: "Secondary buttons",
      description: "Composer utility buttons, voice button, login buttons, and other non-send buttons.",
      fields: { background: "secondaryButtonBg", text: "secondaryButtonText", border: "secondaryButtonBorder", radius: "secondaryButtonRadiusPx" },
      selectors: ["button"],
      match: function (el) {
        const btn = closest(el, ["button"]);
        if (!btn || isSendButton(btn)) return null;
        return btn;
      }
    },
    {
      id: "links",
      label: "Links and accent text",
      description: "Links inside the chat area and other accent-colored details. Sidebar links have their own target.",
      fields: { text: "accent" },
      selectors: ["main a"],
      match: function (el) { return !inSidebar(el) && closest(el, ["a"]); }
    },
    {
      id: "code.block",
      label: "Code blocks",
      description: "Inline code and fenced code block backgrounds.",
      fields: { background: "codeBlockBg", text: "codeText", border: "codeBorder", radius: "borderRadiusPx" },
      selectors: [
        '[data-markdown-copy="code-block"]',
        '[data-markdown-copy="inline-code"]',
        ".cgpt-code-block-shell",
        ".cgpt-code-block-pre",
        "pre",
        "code"
      ],
      match: function (el) {
        return closest(el, ['[data-markdown-copy="code-block"]', '[data-markdown-copy="inline-code"]', ".cgpt-code-block-shell"]) ||
          closest(el, ["pre", "code"]);
      }
    }
  ];

  NS.findThemeTargetFromElement = function findThemeTargetFromElement(el) {
    if (!(el instanceof Element)) return null;
    const ignore = closest(el, ["#cgpt-theme-builder", ".cgpt-theme-builder-panel", ".cgpt-theme-builder-modal", ".cgpt-theme-builder-toolbar", ".cgpt-theme-builder-highlight", ".cgpt-theme-builder-multi-highlight"]);
    if (ignore) return null;
    for (const target of NS.THEME_TARGETS) {
      const element = target.match(el);
      if (element instanceof Element) return { target: target, element: element };
    }
    return null;
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
