
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

(function initPresets(global) {
  const NS = (global.CgptUiEnhancer = global.CgptUiEnhancer || {});

  /**
   * @typedef {typeof NS.DEFAULT_CUSTOM_THEME} ThemeColors
   */

  /** @type {Record<string, ThemeColors & { label: string }>} */
  const PRESETS = {
    "default-plus": {
      label: "Default+",
      mainPageBg: "#212121",
      sidebarBg: "#171717",
      headerBg: "#212121",
      chatAreaBg: "#212121",
      userBubbleBg: "transparent",
      userBubbleText: "#ececec",
      assistantSurfaceBg: "#2f2f2f",
      assistantText: "#ececec",
      composerBg: "#2f2f2f",
      primaryText: "#ececec",
      secondaryText: "#b4b4b4",
      borderColor: "#424242",
      scrollbarTrack: "#2a2a2a",
      scrollbarThumb: "#676767",
      codeBlockBg: "#1b1b1b",
      accent: "#10a37f",
      fontSizePx: 14,
      messageSpacingPx: 12,
      borderRadiusPx: 12,
      composerRadiusPx: 24,
    },
    "amoled-black": {
      label: "AMOLED Black",
      mainPageBg: "#000000",
      sidebarBg: "#000000",
      headerBg: "#000000",
      chatAreaBg: "#000000",
      userBubbleBg: "transparent",
      userBubbleText: "#f5f5f5",
      assistantSurfaceBg: "#0a0a0a",
      assistantText: "#f0f0f0",
      composerBg: "#0a0a0a",
      primaryText: "#f5f5f5",
      secondaryText: "#a3a3a3",
      borderColor: "#1f1f1f",
      scrollbarTrack: "#000000",
      scrollbarThumb: "#3d3d3d",
      codeBlockBg: "#050505",
      accent: "#3ecf8e",
      fontSizePx: 14,
      messageSpacingPx: 12,
      borderRadiusPx: 12,
      composerRadiusPx: 24,
    },
    "soft-dark": {
      label: "Soft Dark",
      mainPageBg: "#1e1e2e",
      sidebarBg: "#181825",
      headerBg: "#1e1e2e",
      chatAreaBg: "#1e1e2e",
      userBubbleBg: "transparent",
      userBubbleText: "#dce0e8",
      assistantSurfaceBg: "#313244",
      assistantText: "#dce0e8",
      composerBg: "#313244",
      primaryText: "#dce0e8",
      secondaryText: "#a6adc8",
      borderColor: "#45475a",
      scrollbarTrack: "#252536",
      scrollbarThumb: "#585b70",
      codeBlockBg: "#11111b",
      accent: "#89b4fa",
      fontSizePx: 14,
      messageSpacingPx: 14,
      borderRadiusPx: 14,
      composerRadiusPx: 26,
    },
    "midnight-blue": {
      label: "Midnight Blue",
      mainPageBg: "#0f172a",
      sidebarBg: "#020617",
      headerBg: "#0f172a",
      chatAreaBg: "#0f172a",
      userBubbleBg: "transparent",
      userBubbleText: "#e2e8f0",
      assistantSurfaceBg: "#1e293b",
      assistantText: "#e2e8f0",
      composerBg: "#1e293b",
      primaryText: "#f1f5f9",
      secondaryText: "#94a3b8",
      borderColor: "#334155",
      scrollbarTrack: "#0b1220",
      scrollbarThumb: "#475569",
      codeBlockBg: "#020617",
      accent: "#38bdf8",
      fontSizePx: 14,
      messageSpacingPx: 12,
      borderRadiusPx: 12,
      composerRadiusPx: 24,
    },
    "midnight-purple": {
      label: "Midnight Purple",
      mainPageBg: "#1a1025",
      sidebarBg: "#12081c",
      headerBg: "#1a1025",
      chatAreaBg: "#1a1025",
      userBubbleBg: "transparent",
      userBubbleText: "#f3e8ff",
      assistantSurfaceBg: "#2a1f38",
      assistantText: "#ede9fe",
      composerBg: "#2d1f3d",
      primaryText: "#faf5ff",
      secondaryText: "#c4b5fd",
      borderColor: "#4c3a63",
      scrollbarTrack: "#150d1f",
      scrollbarThumb: "#6d5a82",
      codeBlockBg: "#0f0618",
      accent: "#c084fc",
      fontSizePx: 14,
      messageSpacingPx: 12,
      borderRadiusPx: 14,
      composerRadiusPx: 26,
    },
    slate: {
      label: "Slate",
      mainPageBg: "#1c2433",
      sidebarBg: "#151c28",
      headerBg: "#1c2433",
      chatAreaBg: "#1c2433",
      userBubbleBg: "transparent",
      userBubbleText: "#e8edf5",
      assistantSurfaceBg: "#2a3447",
      assistantText: "#e8edf5",
      composerBg: "#2f3a4f",
      primaryText: "#f1f4f9",
      secondaryText: "#9fb0c8",
      borderColor: "#3d4d66",
      scrollbarTrack: "#222b3a",
      scrollbarThumb: "#5c6d8a",
      codeBlockBg: "#121824",
      accent: "#7dd3fc",
      fontSizePx: 14,
      messageSpacingPx: 12,
      borderRadiusPx: 10,
      composerRadiusPx: 22,
    },
    "warm-sepia": {
      label: "Warm Sepia",
      mainPageBg: "#2a2419",
      sidebarBg: "#221c14",
      headerBg: "#2a2419",
      chatAreaBg: "#2a2419",
      userBubbleBg: "transparent",
      userBubbleText: "#f5efe3",
      assistantSurfaceBg: "#3a3225",
      assistantText: "#f2eadc",
      composerBg: "#3d3426",
      primaryText: "#faf6ee",
      secondaryText: "#c9b89a",
      borderColor: "#5c4f3a",
      scrollbarTrack: "#241f15",
      scrollbarThumb: "#7d6e52",
      codeBlockBg: "#1a1610",
      accent: "#d4a574",
      fontSizePx: 15,
      messageSpacingPx: 14,
      borderRadiusPx: 10,
      composerRadiusPx: 20,
    },
    "forest-dark": {
      label: "Forest Dark",
      mainPageBg: "#142018",
      sidebarBg: "#0f1812",
      headerBg: "#142018",
      chatAreaBg: "#142018",
      userBubbleBg: "transparent",
      userBubbleText: "#e8f5ec",
      assistantSurfaceBg: "#1c2e24",
      assistantText: "#e5f2e9",
      composerBg: "#1f3328",
      primaryText: "#ecfdf3",
      secondaryText: "#9fb8a6",
      borderColor: "#2d4a38",
      scrollbarTrack: "#101a14",
      scrollbarThumb: "#4a6b55",
      codeBlockBg: "#0a120e",
      accent: "#4ade80",
      fontSizePx: 14,
      messageSpacingPx: 12,
      borderRadiusPx: 12,
      composerRadiusPx: 24,
    },
  };

  NS.PRESETS = PRESETS;

  NS.getPresetList = function getPresetList() {
    return Object.keys(PRESETS).map(function (id) {
      return { id: id, label: PRESETS[id].label };
    });
  };

  NS.getPresetTheme = function getPresetTheme(presetId) {
    const base = PRESETS[presetId];
    if (!base) return Object.assign({}, NS.DEFAULT_CUSTOM_THEME);
    const copy = Object.assign({}, base);
    delete copy.label;
    return Object.assign({}, NS.DEFAULT_CUSTOM_THEME, copy);
  };

  NS.isBuiltInPreset = function isBuiltInPreset(id) {
    return Object.prototype.hasOwnProperty.call(PRESETS, id);
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
