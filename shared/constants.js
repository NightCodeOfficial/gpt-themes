
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

(function initConstants(global) {
  const NS = (global.CgptUiEnhancer = global.CgptUiEnhancer || {});

  NS.STORAGE_KEYS = {
    enabled: "cgptUi_enabled",
    branding: "cgptUi_branding",
    activePresetId: "cgptUi_activePresetId",
    customTheme: "cgptUi_customTheme",
    background: "cgptUi_background",
    savedThemes: "cgptUi_savedThemes",
    quickThemeIds: "cgptUi_quickThemeIds",
    backgroundImageChunkCount: "cgptUi_bgImageChunkCount",
    themeBuilderRequest: "cgptUi_themeBuilderRequest",
    backgroundImageChunkPrefix: "cgptUi_bgImageChunk_",
    savedThemeImageChunkPrefix: "cgptUi_savedThemeImageChunk_",
  };

  NS.DEFAULT_CUSTOM_THEME = {
    mainPageBg: "#212121",
    sidebarBg: "#171717",
    sidebarText: "#ececec",
    sidebarBorder: "#424242",
    sidebarItemBg: "transparent",
    sidebarItemText: "#ececec",
    sidebarItemBorder: "transparent",
    sidebarItemRadiusPx: 12,
    sidebarIconColor: "#ececec",
    headerBg: "#212121",
    headerText: "#ececec",
    headerBorder: "#424242",
    chatAreaBg: "#212121",
    userBubbleBg: "transparent",
    userBubbleText: "#ececec",
    userBubbleBorder: "transparent",
    assistantSurfaceBg: "#303030",
    assistantText: "#ececec",
    assistantBorder: "transparent",
    composerBg: "#303030",
    composerInputBg: "transparent",
    composerText: "#ececec",
    composerBorder: "#424242",
    bottomDockBg: "transparent",
    bottomDockBorder: "transparent",
    primaryText: "#ececec",
    secondaryText: "#b4b4b4",
    borderColor: "#424242",
    scrollbarTrack: "#2a2a2a",
    scrollbarThumb: "#5a5a5a",
    codeBlockBg: "#1e1e1e",
    codeText: "#ececec",
    codeBorder: "#424242",
    secondaryButtonBg: "#303030",
    secondaryButtonText: "#ececec",
    secondaryButtonBorder: "#424242",
    secondaryButtonRadiusPx: 999,
    sendButtonBg: "#10a37f",
    sendButtonText: "#ffffff",
    sendButtonRadiusPx: 999,
    accent: "#10a37f",
    fontSizePx: 14,
    messageSpacingPx: 12,
    borderRadiusPx: 12,
    composerRadiusPx: 24,
  };

  NS.DEFAULT_BRANDING = { mode: "original", dataUrl: "" };

  NS.DEFAULT_BACKGROUND = {
    dataUrl: "",
    imageKey: "global",
    hasImage: false,
    opacity: 0.45,
    blurPx: 0,
    overlayColor: "#000000",
    overlayStrength: 0.25,
    fit: "cover",
    position: "center",
    scope: "full",
  };

  NS.IMAGE_CHUNK_SIZE = 256 * 1024;

  NS.SIDEBAR_SELECTORS = [
    "#stage-slideover-sidebar",
    "#stage-sidebar-tiny-bar",
    "#stage-popover-sidebar",
    "#app-shell-sidebar",
    "nav[data-app-navigation-rail='true']",
    "nav[aria-label='Chat history']",
    "nav[aria-label*='Chat history' i]",
  ];

  NS.COMPOSER_ROOT_SELECTORS = [
    "form[data-type='unified-composer']",
    "form[data-chatgpt-composer]",
    "[data-testid='composer-root']",
    "#thread-bottom-container",
    "#thread-bottom",
    "[data-thread-scroll-footer='true']",
  ];

  NS.STYLE_ELEMENT_ID = "cgpt-ui-enhancer-theme-style";
  NS.BG_LAYER_ID = "cgpt-ui-enhancer-bg-layer";
  NS.HTML_CLASS = "cgpt-ui-enhancer-active";
})(typeof globalThis !== "undefined" ? globalThis : this);
