
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

(function initStorage(global) {
  const NS = (global.CgptUiEnhancer = global.CgptUiEnhancer || {});
  const KEYS = NS.STORAGE_KEYS;

  function getArea() {
    return chrome.storage.local;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function cloneTheme(theme) {
    return Object.assign({}, NS.DEFAULT_CUSTOM_THEME, theme || {});
  }

  function cloneBackground(bg) {
    return Object.assign({}, NS.DEFAULT_BACKGROUND, bg || {});
  }

  function normalizeUserBubbleDefaultTransparent(theme) {
    const out = cloneTheme(theme);
    // This is intentionally the same effective state as pressing
    // Core colors > User bubble > Transparent.
    out.userBubbleBg = "transparent";
    out.userBubbleBorder = "transparent";
    return out;
  }


  function backgroundWithoutData(bg) {
    const clean = cloneBackground(bg);
    clean.hasImage = !!clean.dataUrl || !!clean.hasImage;
    clean.dataUrl = "";
    return clean;
  }

  function cleanSavedTheme(item) {
    if (!item || typeof item !== "object") return null;
    const id = typeof item.id === "string" ? item.id : "";
    const label = typeof item.label === "string" ? item.label.trim() : "";
    if (!id || !label) return null;
    const bg = cloneBackground(item.background);
    if (!bg.imageKey) bg.imageKey = id;
    return {
      id: id,
      label: label,
      theme: cloneTheme(item.theme),
      background: bg,
      showInPopup: item.showInPopup !== false,
      createdAt: item.createdAt || nowIso(),
      updatedAt: item.updatedAt || nowIso(),
    };
  }

  function uniqueIds(ids) {
    const seen = Object.create(null);
    return (ids || []).filter(function (id) {
      if (typeof id !== "string" || seen[id]) return false;
      seen[id] = true;
      return true;
    });
  }

  function defaultQuickThemeIds(savedThemes) {
    return NS.getPresetList()
      .map(function (p) { return p.id; })
      .concat((savedThemes || []).filter(function (t) { return t.showInPopup; }).map(function (t) { return t.id; }));
  }

  function chunkCountKeyFor(kind, id) {
    if (kind === "global") return KEYS.backgroundImageChunkCount;
    return KEYS.savedThemeImageChunkPrefix + id + "_count";
  }

  function chunkKeyFor(kind, id, index) {
    if (kind === "global") return KEYS.backgroundImageChunkPrefix + index;
    return KEYS.savedThemeImageChunkPrefix + id + "_chunk_" + index;
  }

  NS.storageGet = function storageGet(keys) {
    return new Promise(function (resolve, reject) {
      try {
        getArea().get(keys, function (items) {
          const err = chrome.runtime.lastError;
          if (err) reject(err);
          else resolve(items || {});
        });
      } catch (e) {
        reject(e);
      }
    });
  };

  NS.storageSet = function storageSet(obj) {
    return new Promise(function (resolve, reject) {
      try {
        getArea().set(obj, function () {
          const err = chrome.runtime.lastError;
          if (err) reject(err);
          else resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  };

  NS.storageRemove = function storageRemove(keys) {
    return new Promise(function (resolve, reject) {
      try {
        getArea().remove(keys, function () {
          const err = chrome.runtime.lastError;
          if (err) reject(err);
          else resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  };

  async function removeImageChunks(kind, id) {
    const countKey = chunkCountKeyFor(kind, id);
    const raw = await NS.storageGet([countKey]);
    const count = Number(raw[countKey]) || 0;
    const keys = [countKey];
    for (let i = 0; i < count; i++) keys.push(chunkKeyFor(kind, id, i));
    await NS.storageRemove(keys);
  }

  async function saveImageChunks(kind, id, dataUrl) {
    await removeImageChunks(kind, id);
    if (!dataUrl) return false;
    const size = NS.IMAGE_CHUNK_SIZE || 262144;
    const chunks = [];
    for (let i = 0; i < dataUrl.length; i += size) chunks.push(dataUrl.slice(i, i + size));
    const payload = { [chunkCountKeyFor(kind, id)]: chunks.length };
    chunks.forEach(function (chunk, index) {
      payload[chunkKeyFor(kind, id, index)] = chunk;
    });
    await NS.storageSet(payload);
    return chunks.length > 0;
  }

  async function readImageChunks(kind, id) {
    const countKey = chunkCountKeyFor(kind, id);
    const rawCount = await NS.storageGet([countKey]);
    const count = Number(rawCount[countKey]) || 0;
    if (!count) return "";
    const keys = [];
    for (let i = 0; i < count; i++) keys.push(chunkKeyFor(kind, id, i));
    const raw = await NS.storageGet(keys);
    let out = "";
    for (let i = 0; i < count; i++) {
      const part = raw[chunkKeyFor(kind, id, i)];
      if (typeof part !== "string") return "";
      out += part;
    }
    return out;
  }

  async function hydrateBackground(bg, kind, id) {
    const out = cloneBackground(bg);
    const dataUrl = await readImageChunks(kind, id);
    if (dataUrl) {
      out.dataUrl = dataUrl;
      out.hasImage = true;
    } else if (out.dataUrl) {
      out.hasImage = true;
    } else {
      out.dataUrl = "";
      out.hasImage = false;
    }
    return out;
  }

  async function storeGlobalBackground(bg) {
    const dataUrl = typeof bg.dataUrl === "string" ? bg.dataUrl : "";
    const hasImage = await saveImageChunks("global", "global", dataUrl);
    const clean = backgroundWithoutData(bg);
    clean.imageKey = "global";
    clean.hasImage = hasImage;
    await NS.storageSet({ [KEYS.background]: clean });
    return clean;
  }

  async function storeSavedThemeImage(id, bg) {
    const dataUrl = typeof bg.dataUrl === "string" ? bg.dataUrl : "";
    const hasImage = await saveImageChunks("theme", id, dataUrl);
    const clean = backgroundWithoutData(bg);
    clean.imageKey = id;
    clean.hasImage = hasImage;
    return clean;
  }

  NS.normalizeBranding = function normalizeBranding(value) {
    const v = value && typeof value === "object" ? value : {};
    const mode = ["original", "hidden", "custom"].includes(v.mode) ? v.mode : "original";
    // Uploads are rasterized locally before storage; never load remote logos.
    const dataUrl = typeof v.dataUrl === "string" && /^data:image\/png;base64,[a-z0-9+/=]+$/i.test(v.dataUrl) ? v.dataUrl : "";
    return { mode, dataUrl };
  };

  NS.saveBranding = function saveBranding(value) {
    return NS.storageSet({ [KEYS.branding]: NS.normalizeBranding(value) });
  };

  NS.loadFullState = async function loadFullState() {
    const raw = await NS.storageGet([
      KEYS.enabled,
      KEYS.branding,
      KEYS.activePresetId,
      KEYS.customTheme,
      KEYS.background,
      KEYS.savedThemes,
      KEYS.quickThemeIds,
      KEYS.themeBuilderRequest,
      KEYS.backgroundImageChunkCount,
    ]);

    const enabled = raw[KEYS.enabled] !== false;
    let savedThemes = Array.isArray(raw[KEYS.savedThemes])
      ? raw[KEYS.savedThemes].map(cleanSavedTheme).filter(Boolean)
      : [];

    savedThemes = await Promise.all(savedThemes.map(async function (t) {
      t.background = await hydrateBackground(t.background, "theme", t.id);
      return t;
    }));

    let activePresetId = typeof raw[KEYS.activePresetId] === "string" ? raw[KEYS.activePresetId] : "default-plus";
    const savedIds = savedThemes.map(function (t) { return t.id; });
    if (activePresetId !== "custom" && !NS.isBuiltInPreset(activePresetId) && savedIds.indexOf(activePresetId) === -1) {
      activePresetId = "default-plus";
    }

    const customTheme = normalizeUserBubbleDefaultTransparent(raw[KEYS.customTheme]);
    let background = cloneBackground(raw[KEYS.background]);

    // Backward compatibility for old builds that stored a data URL directly in cgptUi_background.
    if (background.dataUrl && !raw[KEYS.backgroundImageChunkCount]) {
      await storeGlobalBackground(background);
    }
    background = await hydrateBackground(background, "global", "global");

    const validIds = NS.getPresetList().map(function (p) { return p.id; }).concat(savedIds);
    let quickThemeIds = Array.isArray(raw[KEYS.quickThemeIds])
      ? uniqueIds(raw[KEYS.quickThemeIds]).filter(function (id) { return validIds.indexOf(id) !== -1; })
      : defaultQuickThemeIds(savedThemes);
    if (!quickThemeIds.length) quickThemeIds = defaultQuickThemeIds(savedThemes);

    return { enabled, branding: NS.normalizeBranding(raw[KEYS.branding]), activePresetId, customTheme, background, savedThemes, quickThemeIds, cgptUi_themeBuilderRequest: raw[KEYS.themeBuilderRequest] || 0 };
  };

  NS.resolveTheme = function resolveTheme(state) {
    if (!state) return normalizeUserBubbleDefaultTransparent();
    if (state.activePresetId === "custom") return normalizeUserBubbleDefaultTransparent(state.customTheme);
    const saved = (state.savedThemes || []).find(function (t) { return t.id === state.activePresetId; });
    if (saved) return normalizeUserBubbleDefaultTransparent(saved.theme);
    return normalizeUserBubbleDefaultTransparent(NS.getPresetTheme(state.activePresetId));
  };

  NS.resolveBackground = function resolveBackground(state) {
    if (!state) return cloneBackground();
    const saved = (state.savedThemes || []).find(function (t) { return t.id === state.activePresetId; });
    if (saved) return cloneBackground(saved.background);
    return cloneBackground(state.background);
  };

  NS.getAllThemeChoices = function getAllThemeChoices(state) {
    const builtIns = NS.getPresetList().map(function (p) {
      return { id: p.id, label: p.label, type: "builtIn" };
    });
    const saved = (state.savedThemes || []).map(function (t) {
      return { id: t.id, label: t.label, type: "saved" };
    });
    return builtIns.concat(saved);
  };

  NS.saveEnabled = function saveEnabled(enabled) {
    return NS.storageSet({ [KEYS.enabled]: !!enabled });
  };

  NS.saveActivePreset = function saveActivePreset(presetId) {
    return NS.storageSet({ [KEYS.activePresetId]: presetId });
  };

  NS.saveCustomTheme = function saveCustomTheme(theme) {
    return NS.storageSet({ [KEYS.customTheme]: cloneTheme(theme) });
  };

  NS.saveBackground = function saveBackground(bg) {
    return storeGlobalBackground(cloneBackground(bg));
  };

  NS.saveBackgroundForActive = async function saveBackgroundForActive(state, bg) {
    const activeId = state && state.activePresetId;
    const savedThemes = state && Array.isArray(state.savedThemes) ? state.savedThemes.slice() : [];
    const index = savedThemes.findIndex(function (t) { return t.id === activeId; });
    if (index === -1) {
      return storeGlobalBackground(cloneBackground(bg));
    }

    const updated = Object.assign({}, savedThemes[index]);
    updated.background = await storeSavedThemeImage(updated.id, cloneBackground(bg));
    updated.updatedAt = nowIso();
    savedThemes[index] = cleanSavedTheme(updated);
    await NS.storageSet({ [KEYS.savedThemes]: savedThemes });
    return updated.background;
  };

  NS.slugifyThemeName = function slugifyThemeName(name) {
    const base = (name || "theme").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "theme";
    return "saved-" + base + "-" + Date.now().toString(36);
  };

  NS.saveNamedTheme = async function saveNamedTheme(label, theme, background) {
    const state = await NS.loadFullState();
    const id = NS.slugifyThemeName(label);
    const cleanBg = await storeSavedThemeImage(id, cloneBackground(background));
    const item = cleanSavedTheme({
      id: id,
      label: label,
      theme: theme,
      background: cleanBg,
      showInPopup: true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    const savedThemes = state.savedThemes.concat([item]);
    const quickThemeIds = uniqueIds(state.quickThemeIds.concat([id]));
    await NS.storageSet({
      [KEYS.savedThemes]: savedThemes,
      [KEYS.quickThemeIds]: quickThemeIds,
      [KEYS.activePresetId]: id,
    });
    return item;
  };



  NS.updateNamedTheme = async function updateNamedTheme(id, theme, background) {
    const state = await NS.loadFullState();
    const savedThemes = state.savedThemes.slice();
    const index = savedThemes.findIndex(function (t) { return t.id === id; });
    if (index === -1) throw new Error("Theme not found.");
    const existing = savedThemes[index];
    const cleanBg = await storeSavedThemeImage(id, cloneBackground(background));
    const item = cleanSavedTheme({
      id: id,
      label: existing.label,
      theme: theme,
      background: cleanBg,
      showInPopup: existing.showInPopup !== false,
      createdAt: existing.createdAt || nowIso(),
      updatedAt: nowIso(),
    });
    savedThemes[index] = item;
    await NS.storageSet({
      [KEYS.savedThemes]: savedThemes,
      [KEYS.activePresetId]: id,
    });
    return item;
  };

  NS.deleteSavedTheme = async function deleteSavedTheme(id) {
    const state = await NS.loadFullState();
    await removeImageChunks("theme", id);
    const savedThemes = state.savedThemes.filter(function (t) { return t.id !== id; }).map(function (t) {
      const copy = Object.assign({}, t);
      copy.background = backgroundWithoutData(copy.background);
      return copy;
    });
    const quickThemeIds = state.quickThemeIds.filter(function (x) { return x !== id; });
    const nextActive = state.activePresetId === id ? "default-plus" : state.activePresetId;
    await NS.storageSet({
      [KEYS.savedThemes]: savedThemes,
      [KEYS.quickThemeIds]: quickThemeIds,
      [KEYS.activePresetId]: nextActive,
    });
  };

  NS.saveQuickThemeIds = function saveQuickThemeIds(ids) {
    return NS.storageSet({ [KEYS.quickThemeIds]: uniqueIds(ids) });
  };

  NS.resetAllToDefaults = async function resetAllToDefaults() {
    const state = await NS.loadFullState().catch(function () { return { savedThemes: [] }; });
    await removeImageChunks("global", "global");
    for (const t of (state.savedThemes || [])) await removeImageChunks("theme", t.id);
    await NS.storageSet({
      [KEYS.enabled]: true,
      [KEYS.branding]: Object.assign({}, NS.DEFAULT_BRANDING),
      [KEYS.activePresetId]: "default-plus",
      [KEYS.customTheme]: cloneTheme(),
      [KEYS.background]: backgroundWithoutData(NS.DEFAULT_BACKGROUND),
      [KEYS.savedThemes]: [],
      [KEYS.quickThemeIds]: NS.getPresetList().map(function (p) { return p.id; }),
    });
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
