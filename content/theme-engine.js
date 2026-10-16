
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

(function initThemeEngine(global) {
  const NS = (global.CgptUiEnhancer = global.CgptUiEnhancer || {});

  let observer = null;
  let resizeObserver = null;
  let observedSidebarEl = null;
  let rafId = 0;
  let lastSidebarWidthPx = 0;
  let selectionStateRafId = 0;

  function ensureStyleEl() {
    let el = document.getElementById(NS.STYLE_ELEMENT_ID);
    if (!el) {
      el = document.createElement("style");
      el.id = NS.STYLE_ELEMENT_ID;
      (document.head || document.documentElement).appendChild(el);
    }
    return el;
  }

  function ensureBgLayer() {
    if (!document.body) return null;
    let layer = document.getElementById(NS.BG_LAYER_ID);
    if (!layer) {
      layer = document.createElement("div");
      layer.id = NS.BG_LAYER_ID;
      layer.setAttribute("aria-hidden", "true");
      layer.innerHTML = '<div class="cgpt-bg-image"></div><div class="cgpt-bg-overlay"></div>';
      document.body.insertBefore(layer, document.body.firstChild || null);
    }
    return layer;
  }

  function removeBgLayer() {
    const layer = document.getElementById(NS.BG_LAYER_ID);
    if (layer) layer.remove();
  }

  function clearAppRootMarkers() {
    try {
      document.querySelectorAll(".cgpt-ui-enhancer-app-root").forEach(function (el) {
        el.classList.remove("cgpt-ui-enhancer-app-root");
      });
    } catch (_) {}
  }

  function isExtensionRoot(el) {
    if (!el || !(el instanceof HTMLElement)) return true;
    const id = el.id || "";
    return id === NS.BG_LAYER_ID ||
      id === NS.STYLE_ELEMENT_ID ||
      id === "gptt-editor-root" ||
      id === "gptt-mini-launcher" ||
      id.indexOf("cgpt-ui-enhancer") === 0 ||
      id.indexOf("gptt-") === 0 ||
      (el.classList && (el.classList.contains("cgpt-theme-builder-toolbar") || el.classList.contains("cgpt-theme-builder-panel")));
  }

  function getAppRoot() {
    if (!document.body) return null;
    const children = Array.from(document.body.children).filter(function (el) {
      return el instanceof HTMLElement && !isExtensionRoot(el);
    });

    // Prefer known SPA roots. ChatGPT's exact root has changed over time, so
    // fall back to the largest full-page child instead of every body child.
    const known = children.find(function (el) {
      return el.id === "__next" || el.id === "root" || el.getAttribute("data-nextjs-root") !== null;
    });
    if (known) return known;

    let best = null;
    let bestScore = -Infinity;
    children.forEach(function (el, index) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return;
      const area = Math.max(0, rect.width) * Math.max(0, rect.height);
      const fillsViewport = rect.width >= Math.min(600, window.innerWidth * 0.5) && rect.height >= Math.min(400, window.innerHeight * 0.5);
      const score = (fillsViewport ? 100000000 : 0) + area - index;
      if (score > bestScore) { bestScore = score; best = el; }
    });
    return best;
  }

  function markAppRoot() {
    if (!document.body) return;
    const root = getAppRoot();
    try {
      document.querySelectorAll(".cgpt-ui-enhancer-app-root").forEach(function (el) {
        if (el !== root) el.classList.remove("cgpt-ui-enhancer-app-root");
      });
      if (root) root.classList.add("cgpt-ui-enhancer-app-root");
    } catch (_) {}
  }

  function hexToRgb(hex) {
    const raw = String(hex || "").trim();
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(raw);
    if (m) return parseInt(m[1], 16) + "," + parseInt(m[2], 16) + "," + parseInt(m[3], 16);
    const short = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(raw);
    if (short) return parseInt(short[1] + short[1], 16) + "," + parseInt(short[2] + short[2], 16) + "," + parseInt(short[3] + short[3], 16);
    const rgba = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[0-9.]+)?\s*\)$/i.exec(raw);
    if (rgba) return Math.max(0, Math.min(255, Number(rgba[1]))) + "," + Math.max(0, Math.min(255, Number(rgba[2]))) + "," + Math.max(0, Math.min(255, Number(rgba[3])));
    if (raw === "transparent") return "0,0,0";
    return "0,0,0";
  }

  function cssUrl(dataUrl) {
    if (!dataUrl) return "none";
    return 'url("' + String(dataUrl).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '")';
  }

  function getSidebarRoot() {
    const selectors = NS.SIDEBAR_SELECTORS || [
      "#stage-slideover-sidebar",
      "#stage-sidebar-tiny-bar",
      "#stage-popover-sidebar",
      "#app-shell-sidebar",
      "nav[data-app-navigation-rail='true']",
      "nav[aria-label='Chat history']"
    ];
    const candidates = [];
    for (let i = 0; i < selectors.length; i++) {
      try {
        document.querySelectorAll(selectors[i]).forEach(function (el) {
          if (el instanceof HTMLElement) candidates.push(el);
        });
      } catch (_) {}
    }

    let best = null;
    let bestScore = -Infinity;
    candidates.forEach(function (el) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return;
      // The new app shell keeps a mounted sidebar during collapse animation.
      // Do not count that hidden pane as a permanent chat-background offset.
      if (el.id === "app-shell-sidebar") {
        const frame = el.closest("[data-app-shell-frame]");
        if (frame && frame.getAttribute("data-app-shell-sidebar-open") === "false") return;
      }
      if (el.closest("[inert], [aria-hidden='true']")) return;
      if (rect.width < 40 || rect.width > 420) return;
      if (rect.height < Math.min(280, window.innerHeight * 0.45)) return;
      // The real ChatGPT sidebar is anchored to the left edge. This prevents
      // selection popovers or unrelated asides from being mistaken for it.
      if (rect.left > 8) return;
      const idBonus = el.id === "stage-slideover-sidebar" ? 1200 :
        el.id === "stage-sidebar-tiny-bar" ? 1100 :
        el.id === "stage-popover-sidebar" ? 1000 :
        el.id === "app-shell-sidebar" ? 1200 :
        el.matches("nav[data-app-navigation-rail='true']") ? 900 : 0;
      const navBonus = el.matches("nav[aria-label='Chat history']") ? 120 : 0;
      const heightScore = Math.min(rect.height, window.innerHeight || rect.height);
      const score = idBonus + navBonus + heightScore - rect.left * 10;
      if (score > bestScore) { bestScore = score; best = el; }
    });
    return best;
  }

  function getSidebarWidthPx() {
    const el = getSidebarRoot();
    if (!el) return 0;
    // The popover sidebar overlays the page on narrow layouts; it must not
    // offset the chat-only background layer as if it were a desktop rail.
    if (el.id === "stage-popover-sidebar") return 0;
    // The new app-shell mobile sidebar is a popover, not a permanent page rail.
    if (el.id === "app-shell-sidebar" && el.closest("[data-app-shell-responsive-sidebar='true']") && window.innerWidth < 768) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width < 40 || rect.width > 420) return 0;
    return Math.round(rect.width);
  }

  function backgroundVars(bg, sidebarWidthPx) {
    return [
      ["--cgpt-bg-opacity", typeof bg.opacity === "number" ? bg.opacity : 0.45],
      ["--cgpt-bg-blur", (typeof bg.blurPx === "number" ? bg.blurPx : 0) + "px"],
      ["--cgpt-bg-overlay-color", "rgb(" + hexToRgb(bg.overlayColor || "#000000") + ")"],
      ["--cgpt-bg-overlay-strength", typeof bg.overlayStrength === "number" ? bg.overlayStrength : 0.25],
      ["--cgpt-sidebar-width", sidebarWidthPx + "px"],
    ];
  }

  function alpha(hex, amount) {
    return "rgba(" + hexToRgb(hex) + "," + amount + ")";
  }

  function opaqueColor(value) {
    const raw = String(value || "").trim();
    if (!raw || raw.toLowerCase() === "transparent") return "";

    let m = /^#([a-f\d]{6})([a-f\d]{2})$/i.exec(raw);
    if (m) {
      if (parseInt(m[2], 16) <= 12) return "";
      return "#" + m[1];
    }

    m = /^#([a-f\d])([a-f\d])([a-f\d])([a-f\d])$/i.exec(raw);
    if (m) {
      if (parseInt(m[4] + m[4], 16) <= 12) return "";
      return "#" + m[1] + m[1] + m[2] + m[2] + m[3] + m[3];
    }

    m = /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([0-9.]+)\s*\)$/i.exec(raw);
    if (m) {
      if (Number(m[4]) <= 0.05) return "";
      return "rgb(" + Math.max(0, Math.min(255, Number(m[1]))) + "," +
        Math.max(0, Math.min(255, Number(m[2]))) + "," +
        Math.max(0, Math.min(255, Number(m[3]))) + ")";
    }

    return raw;
  }

  function getOpaqueOverlayColor(theme) {
    const candidates = [
      theme.assistantSurfaceBg,
      theme.composerBg,
      theme.sidebarBg,
      theme.mainPageBg,
      "#303030"
    ];
    for (let i = 0; i < candidates.length; i++) {
      const color = opaqueColor(candidates[i]);
      if (color) return color;
    }
    return "#303030";
  }

  function buildThemeCss(theme, bg, sidebarWidthPx) {
    theme = Object.assign({}, theme || {}, {
      userBubbleBg: "transparent",
      userBubbleBorder: "transparent"
    });
    const overlayBg = getOpaqueOverlayColor(theme);
    const vars = [
      ["--bg-primary", theme.mainPageBg],
      ["--bg-secondary", theme.sidebarBg],
      ["--bg-tertiary", theme.chatAreaBg],
      ["--bg-elevated-primary", overlayBg],
      ["--bg-elevated-secondary", overlayBg],
      ["--text-primary", theme.primaryText],
      ["--cgpt-sidebar-text", theme.sidebarText || theme.primaryText],
      ["--cgpt-sidebar-border", theme.sidebarBorder || theme.borderColor],
      ["--cgpt-sidebar-item-bg", theme.sidebarItemBg || "transparent"],
      ["--cgpt-sidebar-item-text", theme.sidebarItemText || theme.sidebarText || theme.primaryText],
      ["--cgpt-sidebar-item-border", theme.sidebarItemBorder || "transparent"],
      ["--cgpt-sidebar-item-radius", (theme.sidebarItemRadiusPx || 12) + "px"],
      ["--cgpt-sidebar-icon", theme.sidebarIconColor || theme.sidebarItemText || theme.primaryText],
      ["--cgpt-header-text", theme.headerText || theme.primaryText],
      ["--cgpt-header-border", theme.headerBorder || theme.borderColor],
      ["--cgpt-composer-text", theme.composerText || theme.primaryText],
      ["--cgpt-composer-border", theme.composerBorder || theme.borderColor],
      ["--cgpt-composer-outline", String(theme.composerBorder || theme.borderColor || "").toLowerCase() === "transparent" ? "transparent" : alpha(theme.composerBorder || theme.borderColor, 0.28)],
      ["--cgpt-composer-input-bg", theme.composerInputBg || "transparent"],
      ["--cgpt-bottom-dock-bg", theme.bottomDockBg || "transparent"],
      ["--cgpt-bottom-dock-border", theme.bottomDockBorder || "transparent"],
      ["--cgpt-assistant-border", theme.assistantBorder || "transparent"],
      ["--cgpt-user-border", theme.userBubbleBorder || "transparent"],
      ["--cgpt-secondary-button-bg", theme.secondaryButtonBg || theme.assistantSurfaceBg],
      ["--cgpt-secondary-button-text", theme.secondaryButtonText || theme.primaryText],
      ["--cgpt-secondary-button-border", theme.secondaryButtonBorder || theme.borderColor],
      ["--cgpt-secondary-button-radius", (theme.secondaryButtonRadiusPx || 999) + "px"],
      ["--cgpt-overlay-bg", overlayBg],
      ["--cgpt-overlay-text", theme.primaryText],
      ["--cgpt-overlay-border", theme.borderColor],
      ["--cgpt-send-bg", theme.sendButtonBg || theme.accent],
      ["--cgpt-send-text", theme.sendButtonText || "#ffffff"],
      ["--cgpt-send-radius", (theme.sendButtonRadiusPx || 999) + "px"],
      ["--cgpt-code-text", theme.codeText || theme.primaryText],
      ["--cgpt-code-border", theme.codeBorder || theme.borderColor],
      ["--text-secondary", theme.secondaryText],
      ["--text-tertiary", theme.secondaryText],
      ["--color-text", theme.primaryText],
      ["--color-text-secondary", theme.secondaryText],
      ["--color-token-text-primary", theme.primaryText],
      ["--color-token-text-secondary", theme.secondaryText],
      ["--composer-surface", theme.composerBg],
      ["--composer-surface-primary", theme.composerBg],
      ["--composer-background-color", theme.composerBg],
      ["--main-surface-background", theme.mainPageBg],
      ["--main-surface-primary", theme.chatAreaBg],
      ["--main-surface-secondary", theme.chatAreaBg],
      ["--main-surface-tertiary", theme.chatAreaBg],
      ["--sidebar-bg", theme.sidebarBg],
      ["--sidebar-surface", theme.sidebarBg],
      ["--sidebar-surface-primary", theme.sidebarBg],
      ["--sidebar-surface-secondary", theme.sidebarBg],
      ["--sidebar-surface-tertiary", theme.sidebarBg],
      ["--surface-hover", alpha(theme.accent, 0.18)],
      ["--color-surface", theme.chatAreaBg],
      ["--color-surface-secondary", theme.chatAreaBg],
      ["--color-surface-tertiary", theme.chatAreaBg],
      ["--color-surface-elevated", overlayBg],
      ["--color-surface-elevated-secondary", overlayBg],
      ["--color-token-main-surface-primary", theme.chatAreaBg],
      ["--color-token-main-surface-secondary", theme.chatAreaBg],
      ["--color-token-main-surface-tertiary", theme.chatAreaBg],
      ["--color-token-sidebar-surface", theme.sidebarBg],
      ["--color-token-surface-hover", alpha(theme.accent, 0.18)],
      ["--default-theme-user-msg-bg", theme.userBubbleBg],
      ["--default-theme-user-msg-text", theme.userBubbleText],
      ["--codemirror-bg", theme.codeBlockBg],
      ["--cgpt-main-bg", theme.mainPageBg],
      ["--cgpt-sidebar-bg", theme.sidebarBg],
      ["--cgpt-header-bg", theme.headerBg],
      ["--cgpt-chat-bg", theme.chatAreaBg],
      ["--cgpt-user-bg", theme.userBubbleBg],
      ["--cgpt-user-text", theme.userBubbleText],
      ["--cgpt-assistant-bg", theme.assistantSurfaceBg],
      ["--cgpt-assistant-text", theme.assistantText],
      ["--cgpt-composer-bg", theme.composerBg],
      ["--cgpt-border", theme.borderColor],
      ["--cgpt-accent", theme.accent],
      ["--cgpt-font-size-chat", (theme.fontSizePx || 14) + "px"],
      ["--cgpt-message-spacing", (theme.messageSpacingPx || 12) + "px"],
      ["--cgpt-msg-radius", (theme.borderRadiusPx || 12) + "px"],
      ["--cgpt-composer-radius", (theme.composerRadiusPx || 24) + "px"],
      ["--sharp-edge-bottom-shadow", "none"],
      ["--content-fade-surface", "transparent"],
    ].concat(backgroundVars(bg, sidebarWidthPx));

    return "html." + NS.HTML_CLASS + "{" + vars.map(function (pair) {
      return pair[0] + ":" + pair[1] + ";";
    }).join("") + "scrollbar-color:" + theme.scrollbarThumb + " " + theme.scrollbarTrack + ";}";
  }

  function applyBgLayerStyles(bg) {
    // Do not inject a fixed background layer when no image is configured. The
    // no-image state should be handled by normal page/sidebar colors only.
    // Keeping an empty fixed layer behind the app made transparent native
    // surfaces show the chat color in the sidebar.
    if (!bg || !bg.dataUrl) {
      removeBgLayer();
      return;
    }

    const layer = ensureBgLayer();
    if (!layer) return;
    const img = layer.querySelector(".cgpt-bg-image");
    const overlay = layer.querySelector(".cgpt-bg-overlay");
    const fit = bg.fit || "cover";
    const fitMap = {
      cover: ["cover", "no-repeat"],
      contain: ["contain", "no-repeat"],
      tile: ["auto", "repeat"],
    };
    const chosen = fitMap[fit] || fitMap.cover;
    const positionMap = { center: "center", top: "top", bottom: "bottom" };
    if (img) {
      img.style.backgroundImage = cssUrl(bg.dataUrl);
      img.style.opacity = String(typeof bg.opacity === "number" ? bg.opacity : 0.45);
      img.style.filter = "blur(" + (typeof bg.blurPx === "number" ? bg.blurPx : 0) + "px)";
      img.style.backgroundSize = chosen[0];
      img.style.backgroundRepeat = chosen[1];
      img.style.backgroundPosition = positionMap[bg.position] || "center";
    }
    if (overlay) {
      overlay.style.background = bg.overlayColor || "#000000";
      overlay.style.opacity = String(typeof bg.overlayStrength === "number" ? bg.overlayStrength : 0.25);
    }
  }

  function hasActiveTextSelection() {
    try {
      const selection = window.getSelection && window.getSelection();
      return !!(selection && !selection.isCollapsed && String(selection).trim().length > 0);
    } catch (_) {
      return false;
    }
  }

  function updateSelectionClass() {
    selectionStateRafId = 0;
    document.documentElement.classList.toggle("cgpt-ui-enhancer-text-selecting", hasActiveTextSelection());
  }

  function scheduleSelectionClassUpdate() {
    if (selectionStateRafId) return;
    selectionStateRafId = requestAnimationFrame(updateSelectionClass);
  }

  function setSidebarWidth(force) {
    if (!force && hasActiveTextSelection()) return;
    const width = getSidebarWidthPx();
    if (!force && Math.abs(width - lastSidebarWidthPx) < 2) return;
    lastSidebarWidthPx = width;
    document.documentElement.style.setProperty("--cgpt-sidebar-width", width + "px");
  }

  function scheduleSidebarRefresh(force) {
    if (rafId) return;
    rafId = requestAnimationFrame(function () {
      rafId = 0;
      setSidebarWidth(!!force);
      attachResizeObserver();
    });
  }

  function attachResizeObserver() {
    const sidebar = getSidebarRoot();
    if (sidebar === observedSidebarEl) return;
    if (resizeObserver) resizeObserver.disconnect();
    observedSidebarEl = sidebar;
    if (!sidebar || typeof ResizeObserver === "undefined") return;
    resizeObserver = new ResizeObserver(function () {
      scheduleSidebarRefresh(false);
    });
    resizeObserver.observe(sidebar);
  }

  function onWindowResize() {
    scheduleSidebarRefresh(false);
  }

  function startObserver() {
    if (!document.body) return;
    attachResizeObserver();
    if (!observer) {
      // Watch only for sidebar mount/unmount. Attribute churn during text selection
      // must not rewrite layout variables.
      observer = new MutationObserver(function () { markAppRoot(); scheduleSidebarRefresh(false); });
      observer.observe(document.body, { childList: true, subtree: false });
    }
    document.addEventListener("selectionchange", scheduleSelectionClassUpdate, true);
    window.addEventListener("resize", onWindowResize, { passive: true });
  }

  function stopObserver() {
    if (observer) observer.disconnect();
    observer = null;
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = null;
    observedSidebarEl = null;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (selectionStateRafId) { cancelAnimationFrame(selectionStateRafId); selectionStateRafId = 0; }
    document.removeEventListener("selectionchange", scheduleSelectionClassUpdate, true);
    window.removeEventListener("resize", onWindowResize);
    document.documentElement.classList.remove("cgpt-ui-enhancer-text-selecting");
  }

  NS.applyThemeEngine = function applyThemeEngine(state) {
    if (NS.applyBranding) NS.applyBranding(state);
    const style = ensureStyleEl();
    if (!state || !state.enabled) {
      style.textContent = "";
      document.documentElement.classList.remove(NS.HTML_CLASS, "cgpt-ui-enhancer-bg-full", "cgpt-ui-enhancer-bg-chat", "cgpt-ui-enhancer-has-image", "cgpt-ui-enhancer-text-selecting");
      document.documentElement.style.removeProperty("--cgpt-sidebar-width");
      removeBgLayer();
      clearAppRootMarkers();
      stopObserver();
      return;
    }

    const theme = NS.resolveTheme ? NS.resolveTheme(state) : NS.getPresetTheme(state.activePresetId);
    const bg = NS.resolveBackground ? NS.resolveBackground(state) : Object.assign({}, NS.DEFAULT_BACKGROUND, state.background || {});
    const sidebarWidthPx = getSidebarWidthPx();
    lastSidebarWidthPx = sidebarWidthPx;

    markAppRoot();
    style.textContent = buildThemeCss(theme, bg, sidebarWidthPx);
    document.documentElement.classList.add(NS.HTML_CLASS);
    document.documentElement.classList.toggle("cgpt-ui-enhancer-bg-full", bg.scope === "full");
    document.documentElement.classList.toggle("cgpt-ui-enhancer-bg-chat", bg.scope !== "full");
    document.documentElement.classList.toggle("cgpt-ui-enhancer-has-image", !!bg.dataUrl);
    document.documentElement.style.setProperty("--cgpt-sidebar-width", sidebarWidthPx + "px");

    applyBgLayerStyles(bg);
    startObserver();
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
