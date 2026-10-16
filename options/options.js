
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

(function () {
  const NS = window.CgptUiEnhancer;
  const KEYS = NS.STORAGE_KEYS;

  const COLOR_FIELDS = [
    { key: "mainPageBg", label: "Main page background" },
    { key: "sidebarBg", label: "Sidebar background" },
    { key: "headerBg", label: "Header / top bar" },
    { key: "chatAreaBg", label: "Chat area fallback" },
    { key: "userBubbleBg", label: "User message bubble" },
    { key: "userBubbleText", label: "User message text" },
    { key: "assistantSurfaceBg", label: "Assistant surface" },
    { key: "assistantText", label: "Assistant text" },
    { key: "composerBg", label: "Composer / input" },
    { key: "primaryText", label: "Primary text" },
    { key: "secondaryText", label: "Secondary text" },
    { key: "borderColor", label: "Borders" },
    { key: "scrollbarTrack", label: "Scrollbar track" },
    { key: "scrollbarThumb", label: "Scrollbar thumb" },
    { key: "codeBlockBg", label: "Code block background" },
    { key: "accent", label: "Accent / send button" },
  ];

  const statusEl = document.getElementById("status");
  const warnEl = document.getElementById("bg-warn");
  let selectedImagePromise = null;
  let selectedImageDataUrl = null;
  let loadedState = null;
  let logoDataUrl = "";
  let logoUpload = null;

  function flash(msg) {
    statusEl.textContent = msg || "";
    if (msg) {
      setTimeout(function () {
        if (statusEl.textContent === msg) statusEl.textContent = "";
      }, 3500);
    }
  }

  function normalizeHex(val) {
    const s = String(val || "").trim();
    if (/^#[a-f\d]{6}$/i.test(s)) return s;
    if (/^#[a-f\d]{3}$/i.test(s)) {
      const h = s.slice(1);
      return ("#" + h[0] + h[0] + h[1] + h[1] + h[2] + h[2]).toLowerCase();
    }
    return "#000000";
  }

  function buildColorGrid() {
    const grid = document.getElementById("color-grid");
    grid.innerHTML = "";
    COLOR_FIELDS.forEach(function (f) {
      const wrap = document.createElement("div");
      wrap.className = "field";
      const lab = document.createElement("label");
      lab.setAttribute("for", "c-" + f.key);
      lab.textContent = f.label;
      const input = document.createElement("input");
      input.type = "color";
      input.id = "c-" + f.key;
      input.dataset.themeKey = f.key;
      wrap.appendChild(lab);
      wrap.appendChild(input);
      grid.appendChild(wrap);
    });
  }

  function bindRange(id, formatter) {
    const el = document.getElementById(id);
    const out = document.getElementById(id + "-val");
    function upd() { out.textContent = formatter ? formatter(el.value) : el.value; }
    el.addEventListener("input", upd);
    upd();
  }

  function populateThemeForm(theme) {
    const resolved = Object.assign({}, NS.DEFAULT_CUSTOM_THEME, theme || {});
    COLOR_FIELDS.forEach(function (f) {
      const el = document.getElementById("c-" + f.key);
      if (el) el.value = normalizeHex(resolved[f.key]);
    });
    ["fontSizePx", "messageSpacingPx", "borderRadiusPx", "composerRadiusPx"].forEach(function (k) {
      const el = document.getElementById(k);
      el.value = String(resolved[k]);
      el.dispatchEvent(new Event("input"));
    });
  }

  function collectThemeFromForm() {
    const t = Object.assign({}, NS.DEFAULT_CUSTOM_THEME);
    COLOR_FIELDS.forEach(function (f) {
      const el = document.getElementById("c-" + f.key);
      if (el) t[f.key] = el.value;
    });
    ["fontSizePx", "messageSpacingPx", "borderRadiusPx", "composerRadiusPx"].forEach(function (k) {
      const val = parseInt(document.getElementById(k).value, 10);
      if (!Number.isNaN(val)) t[k] = val;
    });
    return t;
  }

  function populateBackgroundForm(bg) {
    const resolved = Object.assign({}, NS.DEFAULT_BACKGROUND, bg || {});
    selectedImagePromise = null;
    selectedImageDataUrl = null;
    document.getElementById("bg-file").value = "";
    document.getElementById("bg-opacity").value = String(resolved.opacity);
    document.getElementById("bg-blur").value = String(resolved.blurPx);
    document.getElementById("bg-overlay-color").value = normalizeHex(resolved.overlayColor);
    document.getElementById("bg-overlay-strength").value = String(resolved.overlayStrength);
    document.getElementById("bg-fit").value = resolved.fit || "cover";
    document.getElementById("bg-position").value = resolved.position || "center";
    document.getElementById("bg-scope").value = resolved.scope || "chat";
    ["bg-opacity", "bg-blur", "bg-overlay-strength"].forEach(function (id) {
      document.getElementById(id).dispatchEvent(new Event("input"));
    });
    warnEl.hidden = false;
    warnEl.textContent = resolved.hasImage || resolved.dataUrl ? "A background image is currently saved for this active theme. Choosing a file will replace it." : "No background image is saved for this active theme.";
  }

  async function collectBackgroundFromForm(prev) {
    const next = Object.assign({}, NS.DEFAULT_BACKGROUND, prev || {});
    next.opacity = Number(document.getElementById("bg-opacity").value);
    next.blurPx = Number(document.getElementById("bg-blur").value);
    next.overlayColor = document.getElementById("bg-overlay-color").value || next.overlayColor;
    next.overlayStrength = Number(document.getElementById("bg-overlay-strength").value);
    next.fit = document.getElementById("bg-fit").value;
    next.position = document.getElementById("bg-position").value;
    next.scope = document.getElementById("bg-scope").value;
    if (selectedImagePromise) {
      selectedImageDataUrl = await selectedImagePromise;
      next.dataUrl = selectedImageDataUrl || "";
    } else if (selectedImageDataUrl === "") {
      next.dataUrl = "";
    }
    return next;
  }

  function renderThemeSelect(state) {
    const sel = document.getElementById("preset-select");
    sel.innerHTML = "";
    if (state.activePresetId === "custom") {
      const opt = document.createElement("option");
      opt.value = "custom";
      opt.textContent = "Custom theme (active)";
      sel.appendChild(opt);
    }
    NS.getAllThemeChoices(state).forEach(function (choice) {
      const opt = document.createElement("option");
      opt.value = choice.id;
      opt.textContent = choice.type === "saved" ? "â˜… " + choice.label : choice.label;
      sel.appendChild(opt);
    });
    sel.value = state.activePresetId;
  }

  function renderQuickThemeList(state) {
    const host = document.getElementById("quick-theme-list");
    host.innerHTML = "";
    const visibleSet = new Set(state.quickThemeIds || []);
    NS.getAllThemeChoices(state).forEach(function (choice) {
      const item = document.createElement("label");
      item.className = "quick-item";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = choice.id;
      cb.checked = visibleSet.has(choice.id);
      const label = document.createElement("span");
      label.className = "label";
      label.innerHTML = "<strong></strong><span></span>";
      label.querySelector("strong").textContent = choice.label;
      label.querySelector("span").textContent = choice.type === "saved" ? "Saved theme" : "Built-in theme";
      item.appendChild(cb);
      item.appendChild(label);
      if (choice.type === "saved") {
        const del = document.createElement("button");
        del.type = "button";
        del.textContent = "Delete";
        del.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          if (!window.confirm("Delete saved theme '" + choice.label + "'?")) return;
          NS.deleteSavedTheme(choice.id).then(loadAndRender).then(function () { flash("Saved theme deleted."); });
        });
        item.appendChild(del);
      }
      host.appendChild(item);
    });
  }

  async function currentStoredBackground() {
    const state = loadedState || await NS.loadFullState();
    return NS.resolveBackground(state);
  }

  async function loadAndRender() {
    const state = await NS.loadFullState();
    loadedState = state;
    logoDataUrl = state.branding.dataUrl;
    document.getElementById("logo-mode").value = state.branding.mode;
    updateLogoForm();
    document.getElementById("enabled").checked = !!state.enabled;
    renderThemeSelect(state);
    populateThemeForm(NS.resolveTheme(state));
    populateBackgroundForm(NS.resolveBackground(state));
    renderQuickThemeList(state);
    return state;
  }

  function updateLogoForm() {
    document.getElementById("logo-custom").hidden = document.getElementById("logo-mode").value !== "custom";
    const preview = document.getElementById("logo-preview");
    preview.hidden = !logoDataUrl;
    if (logoDataUrl) preview.src = logoDataUrl;
    else preview.removeAttribute("src");
  }

  async function resizeLogo(file) {
    if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
    if (file.size > 20 * 1024 * 1024) throw new Error("Choose an image smaller than 20 MB.");
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const scale = Math.min(1, 240 / image.naturalWidth, 56 / image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/png");
    } finally { URL.revokeObjectURL(url); }
  }

  document.getElementById("logo-mode").addEventListener("change", updateLogoForm);
  document.getElementById("logo-file").addEventListener("change", function (event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const status = document.getElementById("logo-status");
    const save = document.getElementById("save-logo");
    status.textContent = "Resizing image…";
    save.disabled = true;
    const pending = resizeLogo(file);
    logoUpload = pending;
    pending.then(function (dataUrl) {
      if (logoUpload !== pending) return;
      logoDataUrl = dataUrl;
      updateLogoForm();
      status.textContent = "Image ready. Save logo settings to apply.";
    }).catch(function () {
      if (logoUpload === pending) status.textContent = "Could not load image. Choose a valid image smaller than 20 MB.";
    }).finally(function () {
      if (logoUpload === pending) { logoUpload = null; save.disabled = false; }
      event.target.value = "";
    });
  });
  document.getElementById("logo-remove").addEventListener("click", function () {
    logoUpload = null;
    logoDataUrl = "";
    document.getElementById("save-logo").disabled = false;
    document.getElementById("logo-mode").value = "original";
    document.getElementById("logo-status").textContent = "Image removed. Save to restore the original logo.";
    updateLogoForm();
  });
  document.getElementById("save-logo").addEventListener("click", async function () {
    const status = document.getElementById("logo-status");
    const mode = document.getElementById("logo-mode").value;
    if (mode === "custom" && !logoDataUrl) { status.textContent = "Choose a custom image first."; return; }
    try {
      await NS.saveBranding({ mode, dataUrl: logoDataUrl });
      status.textContent = "Logo settings saved.";
    } catch (_) { status.textContent = "Could not save logo settings."; }
  });

  buildColorGrid();
  bindRange("fontSizePx", function (v) { return v + " px"; });
  bindRange("messageSpacingPx", function (v) { return v + " px"; });
  bindRange("borderRadiusPx", function (v) { return v + " px"; });
  bindRange("composerRadiusPx", function (v) { return v + " px"; });
  bindRange("bg-opacity", function (v) { return v; });
  bindRange("bg-blur", function (v) { return v + " px"; });
  bindRange("bg-overlay-strength", function (v) { return v; });

  document.getElementById("enabled").addEventListener("change", function (ev) {
    NS.saveEnabled(ev.target.checked).catch(function () { flash("Could not save enabled setting."); });
  });

  document.getElementById("preset-select").addEventListener("change", function (ev) {
    const id = ev.target.value;
    NS.saveActivePreset(id).then(loadAndRender).then(function () { flash("Applied theme."); }).catch(function () { flash("Could not apply theme."); });
  });

  document.getElementById("save-custom").addEventListener("click", async function () {
    try {
      await NS.saveCustomTheme(collectThemeFromForm());
      await NS.saveActivePreset("custom");
      await loadAndRender();
      flash("Custom theme saved and applied.");
    } catch (err) {
      flash("Save failed: " + (err && err.message ? err.message : "unknown error"));
    }
  });

  document.getElementById("reset-custom-colors").addEventListener("click", function () {
    populateThemeForm(NS.getPresetTheme("default-plus"));
    flash("Form reset to Default+. Click save to apply it.");
  });

  document.getElementById("bg-file").addEventListener("change", function (ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    warnEl.hidden = false;
    warnEl.textContent = "Reading image: " + (file.size / 1024 / 1024).toFixed(2) + " MB...";
    selectedImagePromise = new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(typeof reader.result === "string" ? reader.result : ""); };
      reader.onerror = function () { reject(new Error("Could not read image file.")); };
      reader.readAsDataURL(file);
    }).then(function (dataUrl) {
      selectedImageDataUrl = dataUrl;
      warnEl.textContent = "Image ready. Click Save background settings or Save named quick theme.";
      return dataUrl;
    }).catch(function (err) {
      selectedImagePromise = null;
      selectedImageDataUrl = null;
      warnEl.textContent = err.message;
      throw err;
    });
  });

  document.getElementById("bg-remove").addEventListener("click", async function () {
    try {
      selectedImagePromise = null;
      selectedImageDataUrl = "";
      const bg = await currentStoredBackground();
      bg.dataUrl = "";
      await NS.saveBackgroundForActive(loadedState || await NS.loadFullState(), bg);
      await loadAndRender();
      flash("Background image removed.");
    } catch (err) {
      flash("Remove failed.");
    }
  });

  document.getElementById("save-bg").addEventListener("click", async function () {
    try {
      const prev = await currentStoredBackground();
      const next = await collectBackgroundFromForm(prev);
      await NS.saveBackgroundForActive(loadedState || await NS.loadFullState(), next);
      await loadAndRender();
      flash("Background settings saved.");
    } catch (err) {
      flash("Save failed: " + (err && err.message ? err.message : "unknown error"));
    }
  });

  document.getElementById("save-named-theme").addEventListener("click", async function () {
    try {
      const name = document.getElementById("theme-name").value.trim();
      if (!name) {
        flash("Enter a name for the saved theme first.");
        return;
      }
      const theme = collectThemeFromForm();
      const prev = await currentStoredBackground();
      const bg = await collectBackgroundFromForm(prev);
      const item = await NS.saveNamedTheme(name, theme, bg);
      document.getElementById("theme-name").value = "";
      await loadAndRender();
      flash("Saved and applied named theme: " + item.label);
    } catch (err) {
      flash("Save failed: " + (err && err.message ? err.message : "unknown error"));
    }
  });

  document.getElementById("save-quick-list").addEventListener("click", async function () {
    try {
      const ids = Array.from(document.querySelectorAll("#quick-theme-list input[type='checkbox']:checked")).map(function (cb) { return cb.value; });
      await NS.saveQuickThemeIds(ids);
      await loadAndRender();
      flash("Popup quick theme list saved.");
    } catch (err) {
      flash("Could not save popup list.");
    }
  });

  document.getElementById("reset-all").addEventListener("click", function () {
    if (!window.confirm("Reset all extension settings to defaults?")) return;
    NS.resetAllToDefaults().then(loadAndRender).then(function () { flash("All settings reset."); }).catch(function () { flash("Reset failed."); });
  });

  loadAndRender().catch(function () { flash("Could not load settings."); });
})();
