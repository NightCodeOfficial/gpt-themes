/*
 * GPT Themes menu-surface guard.
 *
 * ChatGPT's + and slash-command menus are portaled/floating surfaces whose
 * wrapper structure changes frequently. Rather than depending on one generated
 * class name, this guard locates the live menu surface from its menu items,
 * marks the actual container, and forces that container to use GPT Themes'
 * opaque elevated surface color.
 */
(function initMenuSurfaceGuard(global) {
  const NS = (global.CgptUiEnhancer = global.CgptUiEnhancer || {});

  const SURFACE_CLASS = "cgpt-ui-menu-surface";
  const FORCED_BACKGROUND = "var(--cgpt-overlay-bg, var(--cgpt-assistant-bg, #303030))";
  const SIDEBAR_ROOT_SELECTOR = [
    "#stage-slideover-sidebar",
    "#stage-sidebar-tiny-bar",
    "#stage-popover-sidebar",
    "#app-shell-sidebar",
    "nav[data-app-navigation-rail='true']",
    "nav[aria-label='Chat history']",
    "nav[aria-label*='Chat history' i]"
  ].join(",");
  const ITEM_SELECTOR = [
    ".__menu-item",
    "[data-oai-menu-item]",
    "[role='menuitem']",
    "[role='menuitemradio']",
    "[role='menuitemcheckbox']",
    "[role='option']"
  ].join(",");

  const KNOWN_SURFACE_SELECTORS = [
    ".MA-gxq_content[data-content-appearance='touch-optimized']",
    "[data-content-appearance='touch-optimized']",
    "[data-radix-menu-content]",
    "[data-radix-dropdown-menu-content]",
    "[data-radix-popover-content]",
    "[role='menu']",
    "[role='listbox']",
    "[popover]"
  ];

  let observer = null;
  let scheduled = false;
  let lastReport = [];

  function isElement(value) {
    return typeof Element !== "undefined" && value instanceof Element;
  }

  function isVisible(el) {
    if (!isElement(el)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0.01;
  }

  function safeMatches(el, selector) {
    try { return el.matches(selector); } catch (_) { return false; }
  }

  function safeClosest(el, selector) {
    try { return el.closest(selector); } catch (_) { return null; }
  }

  function isInsideSidebar(el) {
    return !!safeClosest(el, SIDEBAR_ROOT_SELECTOR);
  }

  function clearGuardStyles(el) {
    if (!isElement(el) || !el.classList.contains(SURFACE_CLASS)) return;

    // These properties are owned by this guard. Removing them is safe only for
    // elements carrying our marker class; this also cleans stale v0.8.18-v0.8.22
    // false positives after an extension update without requiring a hard reload.
    el.classList.remove(SURFACE_CLASS);
    el.style.removeProperty("background-color");
    el.style.removeProperty("background-image");
    el.style.removeProperty("opacity");
  }

  function cleanupSidebarFalsePositives() {
    try {
      document.querySelectorAll(SIDEBAR_ROOT_SELECTOR).forEach(function (root) {
        if (root.classList && root.classList.contains(SURFACE_CLASS)) clearGuardStyles(root);
        root.querySelectorAll("." + SURFACE_CLASS).forEach(clearGuardStyles);
      });
    } catch (_) {}
  }

  function knownSurfaceFor(item) {
    if (isInsideSidebar(item)) return null;
    for (const selector of KNOWN_SURFACE_SELECTORS) {
      const match = safeClosest(item, selector);
      if (!match || isInsideSidebar(match)) continue;
      if (selector === "[popover]") {
        try {
          if (!match.matches(":popover-open")) continue;
        } catch (_) {
          if (match.getAttribute("popover") == null) continue;
        }
      }
      return match;
    }
    return null;
  }

  function menuItemCount(el) {
    try {
      return Array.from(el.querySelectorAll(ITEM_SELECTOR)).filter(isVisible).length;
    } catch (_) {
      return 0;
    }
  }

  function isPlausibleFallbackSurface(el, item) {
    if (!isElement(el) || !isVisible(el)) return false;
    if (isInsideSidebar(el) || isInsideSidebar(item)) return false;
    if (safeMatches(el, "html, body, main, form[data-type='unified-composer'], [data-testid='composer-root']")) return false;

    const rect = el.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    if (rect.width < Math.max(160, itemRect.width * 0.75)) return false;
    if (rect.height < Math.max(60, itemRect.height * 1.35)) return false;
    if (rect.width > window.innerWidth * 0.94 || rect.height > window.innerHeight * 0.92) return false;
    // Structural navigation rails can contain role=menuitem-style controls. A
    // viewport-tall <nav> is not a transient composer menu even if it has many
    // menu-like descendants.
    if (el.tagName === "NAV" && rect.height > window.innerHeight * 0.65) return false;
    if (menuItemCount(el) < 2) return false;

    const style = getComputedStyle(el);
    const classText = typeof el.className === "string" ? el.className : "";
    const semanticHint = /menu|popover|dropdown|floating|overlay|content/i.test(classText);
    const positioned = style.position === "fixed" || style.position === "absolute" || style.position === "sticky";
    const elevated = style.zIndex !== "auto" && Number(style.zIndex) > 0;
    return semanticHint || positioned || elevated;
  }

  function fallbackSurfaceFor(item) {
    if (isInsideSidebar(item)) return null;
    let node = item.parentElement;
    let fallback = null;
    for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
      if (safeMatches(node, "html, body, main")) break;
      if (isPlausibleFallbackSurface(node, item)) {
        fallback = node;
        break;
      }
    }

    if (fallback) return fallback;

    // Last-resort narrow list wrapper. This deliberately avoids broad page or
    // composer containers; an opaque inner list is safer than repainting the UI.
    const parent = item.parentElement;
    if (parent && isVisible(parent) && !isInsideSidebar(parent) && menuItemCount(parent) >= 2) {
      const rect = parent.getBoundingClientRect();
      const structuralNav = parent.tagName === "NAV" && rect.height > window.innerHeight * 0.65;
      if (!structuralNav && rect.width >= 160 && rect.height >= 60 && rect.width < window.innerWidth * 0.94) {
        return parent;
      }
    }
    return null;
  }

  function findSurface(item) {
    return knownSurfaceFor(item) || fallbackSurfaceFor(item);
  }

  function forceOpaque(surface) {
    if (!isElement(surface) || isInsideSidebar(surface)) return;
    surface.classList.add(SURFACE_CLASS);

    // v0.8.19 intentionally styles only the painted menu container itself.
    // Do not replace ChatGPT's inherited --bg-*/--main-surface-* variables here:
    // menu rows, badges, shortcuts, and nested controls reuse those variables and
    // broad replacement can create dark rectangular boxes inside otherwise-correct
    // menus. Inline !important on the actual surface is sufficient once the live
    // painted element has been identified.
    surface.style.setProperty("background-color", FORCED_BACKGROUND, "important");
    surface.style.setProperty("background-image", "none", "important");
    surface.style.setProperty("opacity", "1", "important");
  }

  function dataAttributes(el) {
    const result = {};
    if (!isElement(el)) return result;
    for (const attr of Array.from(el.attributes || [])) {
      if (attr.name.startsWith("data-") || attr.name === "role" || attr.name === "popover") {
        result[attr.name] = attr.value;
      }
    }
    return result;
  }

  function describe(surface) {
    const style = getComputedStyle(surface);
    const rect = surface.getBoundingClientRect();
    const parent = surface.parentElement;
    const parentStyle = parent ? getComputedStyle(parent) : null;
    return {
      tag: surface.tagName.toLowerCase(),
      id: surface.id || null,
      className: typeof surface.className === "string" ? surface.className : null,
      attributes: dataAttributes(surface),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      computed: {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        opacity: style.opacity,
        position: style.position,
        zIndex: style.zIndex,
        bgElevatedPrimary: style.getPropertyValue("--bg-elevated-primary").trim(),
        cgptOverlayBg: style.getPropertyValue("--cgpt-overlay-bg").trim()
      },
      parent: parent ? {
        tag: parent.tagName.toLowerCase(),
        id: parent.id || null,
        className: typeof parent.className === "string" ? parent.className : null,
        backgroundColor: parentStyle ? parentStyle.backgroundColor : null,
        opacity: parentStyle ? parentStyle.opacity : null
      } : null,
      visibleMenuItems: menuItemCount(surface),
      itemSamples: Array.from(surface.querySelectorAll(ITEM_SELECTOR))
        .filter(isVisible)
        .slice(0, 8)
        .map(function (item) {
          const itemStyle = getComputedStyle(item);
          return {
            tag: item.tagName.toLowerCase(),
            role: item.getAttribute("role"),
            className: typeof item.className === "string" ? item.className : null,
            backgroundColor: itemStyle.backgroundColor,
            backgroundImage: itemStyle.backgroundImage
          };
        })
    };
  }

  function scan() {
    cleanupSidebarFalsePositives();
    const surfaces = new Set();

    // Prefer the exact current touch-optimized surface even before item
    // discovery. The generated MA-* class may change, but the data attribute is
    // currently stable and the item-driven fallback remains available.
    try {
      document.querySelectorAll("[data-content-appearance='touch-optimized']").forEach(function (el) {
        if (isVisible(el) && !isInsideSidebar(el)) surfaces.add(el);
      });
    } catch (_) {}

    try {
      document.querySelectorAll(ITEM_SELECTOR).forEach(function (item) {
        if (!isVisible(item) || isInsideSidebar(item)) return;
        const surface = findSurface(item);
        if (surface) surfaces.add(surface);
      });
    } catch (_) {}

    surfaces.forEach(forceOpaque);
    lastReport = Array.from(surfaces).filter(function (surface) {
      return isVisible(surface) && !isInsideSidebar(surface);
    }).map(describe);
    NS.lastMenuSurfaceReport = lastReport;
    return lastReport;
  }

  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      scan();
    });
  }

  function start() {
    if (observer || !document.documentElement) return;
    observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Menu opening can reuse an existing portal node without inserting it.
    // These interaction hooks catch + clicks, slash typing, keyboard navigation,
    // and focus-driven menu changes without observing every class mutation.
    document.addEventListener("pointerdown", scheduleScan, true);
    document.addEventListener("keydown", scheduleScan, true);
    document.addEventListener("input", scheduleScan, true);
    document.addEventListener("focusin", scheduleScan, true);
    scheduleScan();
  }

  NS.refreshMenuSurfaceGuard = scan;
  NS.cleanupMenuSurfaceFalsePositives = cleanupSidebarFalsePositives;
  NS.inspectOpenMenus = function inspectOpenMenus() {
    return scan();
  };
  NS.getLastMenuSurfaceReport = function getLastMenuSurfaceReport() {
    return lastReport.slice();
  };

  start();
})(typeof globalThis !== "undefined" ? globalThis : this);
