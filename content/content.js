
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

(function initContent() {
  const NS = typeof globalThis !== "undefined" ? globalThis.CgptUiEnhancer : null;
  if (!NS || !NS.loadFullState || !NS.applyThemeEngine) {
    return;
  }

  function refresh() {
    return NS.loadFullState().then(function (state) {
      NS.applyThemeEngine(state);
      if (NS.applyComposerCaretGuard) NS.applyComposerCaretGuard(state);
      if (NS.refreshMenuSurfaceGuard) NS.refreshMenuSurfaceGuard();
      if (NS.refreshCompatibilityReport) NS.refreshCompatibilityReport();
      if (NS.syncThemeBuilder) NS.syncThemeBuilder(state);
    });
  }

  refresh().catch(function () {
    /* ignore */
  });

  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== "local") return;
      refresh().then(function () {
        if (changes && changes[NS.STORAGE_KEYS.themeBuilderRequest] && NS.openThemeBuilder) {
          NS.openThemeBuilder();
        }
      }).catch(function () {
        /* ignore */
      });
    });
  } catch (e) {
    /* ignore */
  }
})();
