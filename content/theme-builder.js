
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

(function initPolishedThemeBuilder(global) {
  const NS = (global.CgptUiEnhancer = global.CgptUiEnhancer || {});

  let state = gpttForceUserBubbleTransparentDefault(null);
  let draftTheme = null;
  let draftBackground = null;
  let selectedTargetId = "chat.background";
  let editorRoot = null;
  let launcher = null;
  let highlights = [];
  let persistTimer = 0;
  let applyTimer = 0;
  let previewTimer = 0;
  let toastTimer = 0;
  let launcherHidden = false;
  let launcherPosition = null;
  let launcherDrag = null;
  let editorDrag = null;

  const FIELD_LABELS = {
    mainPageBg: "Page background",
    sidebarBg: "Sidebar background",
    sidebarText: "Sidebar text",
    sidebarBorder: "Sidebar border",
    sidebarItemBg: "Sidebar item background",
    sidebarItemText: "Sidebar item text",
    sidebarItemBorder: "Sidebar item border",
    sidebarIconColor: "Sidebar icon color",
    headerBg: "Header background",
    headerText: "Header text",
    headerBorder: "Header border",
    chatAreaBg: "Chat background",
    userBubbleBg: "User bubble background",
    userBubbleText: "User bubble text",
    assistantText: "Assistant text",
    composerInputBg: "Composer input background",
    composerText: "Composer text",
    composerBorder: "Composer border",
    bottomDockBg: "Bottom dock background",
    bottomDockBorder: "Bottom dock border",
    primaryText: "Primary text",
    secondaryText: "Secondary text",
    borderColor: "General border",
    codeBlockBg: "Code block background",
    codeText: "Code text",
    codeBorder: "Code border",
    secondaryButtonBg: "Secondary button background",
    secondaryButtonText: "Secondary button text",
    secondaryButtonBorder: "Secondary button border",
    sendButtonBg: "Send button background",
    sendButtonText: "Send button icon",
    accent: "Accent",
    borderRadiusPx: "Message radius",
    composerRadiusPx: "Composer radius",
    sidebarItemRadiusPx: "Sidebar item radius",
    secondaryButtonRadiusPx: "Button radius",
    sendButtonRadiusPx: "Send button radius"
  };

  const SIMPLE_CONTROLS = [
    { label: "Chat background", keys: ["chatAreaBg", "mainPageBg"], hint: "Main conversation canvas" },
    { label: "Outer areas", keys: ["sidebarBg", "headerBg"], hint: "Sidebar and top bar" },
    { label: "User bubble", keys: ["userBubbleBg"], hint: "Your message bubble" },
    { label: "User text", keys: ["userBubbleText"], hint: "Text inside your messages" },
    { label: "Model text", keys: ["assistantText", "primaryText"], hint: "Assistant responses" },
    { label: "Icons and accent", keys: ["sidebarIconColor", "sendButtonBg", "accent"], hint: "Sidebar icons, send button, highlights" }
  ];

  function clone(obj) { return Object.assign({}, obj || {}); }
  function targets() { return Array.isArray(NS.THEME_TARGETS) ? NS.THEME_TARGETS : []; }
  function targetById(id) { return targets().find(t => t.id === id) || targets()[0] || { label: "Area", fields: {} }; }
  function safeColor(v, fallback) { return parseCssColor(v, fallback).hex; }
  function canColor(v) { return parseCssColor(v, null).valid; }
  function clamp(value, min, max, fallback) { const n = Number(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; }

  function currentStateForEngine() {
    return Object.assign({}, state || {}, {
      enabled: state ? state.enabled !== false : true,
      activePresetId: "custom",
      customTheme: clone(draftTheme),
      background: clone(draftBackground),
      savedThemes: state && state.savedThemes || [],
      quickThemeIds: state && state.quickThemeIds || []
    });
  }

  async function loadDraft() {
    if (!NS.loadFullState) return;
    state = await NS.loadFullState();
    draftTheme = Object.assign({}, NS.DEFAULT_CUSTOM_THEME || {}, NS.resolveTheme ? NS.resolveTheme(state) : state.customTheme || {});
    draftTheme.userBubbleBg = "transparent";
    draftTheme.userBubbleBorder = "transparent";
    draftBackground = Object.assign({}, NS.DEFAULT_BACKGROUND || {}, NS.resolveBackground ? NS.resolveBackground(state) : state.background || {});
  }

  function applyDraft() {
    if (NS.applyThemeEngine) NS.applyThemeEngine(currentStateForEngine());
    refreshHighlight();
  }

  function scheduleApplyDraft() {
    if (applyTimer) return;
    applyTimer = requestAnimationFrame(function () {
      applyTimer = 0;
      applyDraft();
    });
  }

  function schedulePreviewRefresh() {
    if (previewTimer) return;
    previewTimer = requestAnimationFrame(function () {
      previewTimer = 0;
      refreshPreview();
    });
  }

  function schedulePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(async function () {
      try {
        if (NS.saveActivePreset) await NS.saveActivePreset("custom");
        if (NS.saveCustomTheme) await NS.saveCustomTheme(draftTheme);
        if (NS.saveBackground) await NS.saveBackground(draftBackground);
      } catch (_) {}
    }, 200);
  }

  function applyAndPersist() { scheduleApplyDraft(); schedulePersist(); }

  function ensureLauncher() {
    if (launcher && document.documentElement.contains(launcher)) return launcher;
    launcher = document.createElement("button");
    launcher.id = "gptt-mini-launcher";
    if (launcherHidden) return null;
    launcher.innerHTML = '<span>✦</span><em>Open GPT Themes</em><button type="button" class="gptt-launcher-close" title="Hide launcher">×</button>';
    launcher.title = "Open GPT Themes";
    applyLauncherPosition();
    launcher.addEventListener("pointerdown", beginLauncherDrag);
    launcher.addEventListener("click", function (event) {
      if (event.target && event.target.closest && event.target.closest(".gptt-launcher-close")) return;
      if (launcherDrag && launcherDrag.moved) return;
      openEditor();
    });
    launcher.querySelector(".gptt-launcher-close").addEventListener("click", hideLauncher);
    launcher.addEventListener("contextmenu", async function (event) {
      event.preventDefault();
      await toggleEnabled();
    });
    document.documentElement.appendChild(launcher);
    return launcher;
  }

  async function openEditor() {
    launcherHidden = false;
    try { chrome.storage.local.set({ cgptUi_launcherHidden: false }); } catch (_) {}
    await loadDraft();
    applyDraft();
    if (launcher) launcher.remove();
    renderEditor();
  }

  function closeEditor() {
    clearHighlights();
    if (editorRoot) editorRoot.remove();
    editorRoot = null;
    ensureLauncher();
  }

  function renderEditor() {
    if (editorRoot) editorRoot.remove();
    const t = targetById(selectedTargetId);
    editorRoot = document.createElement("div");
    editorRoot.id = "gptt-editor-root";
    editorRoot.innerHTML = `
      <div class="gptt-panel">
        <div class="gptt-header" data-editor-drag-handle>
          <div class="gptt-brand">
            <div class="gptt-title">GPT Themes</div>
            <div class="gptt-subtitle">Theme designer · advanced targeting</div>
          </div>
          <button class="gptt-icon-button" data-action="close" title="Close">×</button>
        </div>
        <div class="gptt-body">
          <section class="gptt-section gptt-quick-actions">
            <div class="gptt-section-title"><span>Quick actions</span><span class="gptt-pill">Ready mode</span></div>
            <div class="gptt-actions gptt-actions-3">
              <button class="gptt-secondary-button" data-action="toggle-enabled">${state && state.enabled === false ? "Enable" : "Disable"}</button>
              <button class="gptt-secondary-button" data-action="reset-area">Reset area</button>
              <button class="gptt-danger-button" data-action="reset">Reset all</button>
            </div>
          </section>

          <section class="gptt-section">
            <div class="gptt-section-title"><span>Themes</span><span class="gptt-pill">Built-in + custom</span></div>
            <div class="gptt-preset-row" data-preset-row></div>
          </section>

          <section class="gptt-section">
            <div class="gptt-section-title"><span>Core colors</span><span class="gptt-pill">Quick edit</span></div>
            <div data-simple-fields></div>
            <p class="gptt-muted">Each color includes transparency. Related surfaces are linked here to keep themes consistent.</p>
          </section>

          <section class="gptt-section gptt-collapsible gptt-advanced-section">
            <details>
              <summary>Advanced area controls</summary>
              <div class="gptt-area-picker">
                <button class="gptt-area-button" data-action="toggle-area-picker"><span data-current-area>${escapeHtml(t.label)}</span><b>⌄</b></button>
                <div class="gptt-area-menu" data-area-menu hidden>
                  <input type="text" placeholder="Search areas…" data-area-search>
                  <div class="gptt-area-list" data-area-list></div>
                </div>
              </div>
              <p class="gptt-muted" data-target-desc>${escapeHtml(t.description || "")}</p>
              <div class="gptt-preview" data-preview-card></div>
              <div class="gptt-section-title gptt-subsection-title"><span>Selected area</span><span class="gptt-pill" data-selected-pill></span></div>
              <div data-fields></div>
            </details>
          </section>

          <section class="gptt-section">
            <div class="gptt-section-title"><span>Background image</span><span class="gptt-pill">Image layer</span></div>
            <div class="gptt-field">
              <label>Image file</label>
              <div class="gptt-file-row">
                <button class="gptt-file-button" data-action="choose-file">Choose image</button>
                <button class="gptt-secondary-button" data-action="clear-bg">Clear image</button>
              </div>
              <input class="gptt-hidden-file" type="file" accept="image/*" data-bg-file>
              <div class="gptt-file-name-line"><span data-file-name>No image selected</span><button class="gptt-danger-button" data-action="clear-bg" title="Remove background">×</button></div>
            </div>
            <div class="gptt-mini-grid">
              <div class="gptt-field"><label>Scope</label><select data-bg-scope><option value="chat">Chat area</option><option value="full">Full page</option></select></div>
              <div class="gptt-field"><label>Fit</label><select data-bg-fit><option value="cover">Cover</option><option value="contain">Contain</option><option value="tile">Tile</option></select></div>
            </div>
            <div class="gptt-field"><div class="gptt-label-row"><label>Image opacity: <span data-opacity-label></span></label><button class="gptt-reset-button" data-action="reset-bg-opacity">Reset</button></div><input type="range" min="0" max="1" step="0.01" data-bg-opacity></div>
            <div class="gptt-field"><div class="gptt-label-row"><label>Overlay strength: <span data-overlay-label></span></label><button class="gptt-reset-button" data-action="reset-bg-overlay">Reset</button></div><input type="range" min="0" max="0.9" step="0.01" data-bg-overlay></div>
            <div class="gptt-field"><div class="gptt-label-row"><label>Image blur: <span data-blur-label></span></label><button class="gptt-reset-button" data-action="reset-bg-blur">Reset</button></div><input type="range" min="0" max="14" step="1" data-bg-blur></div>
          </section>

          <section class="gptt-section gptt-collapsible">
            <details>
              <summary>Theme library</summary>
              <div class="gptt-field"><label>New theme name</label><input type="text" placeholder="Theme name" data-new-theme-name><button class="gptt-primary-button" data-action="save-new">Save as new theme</button></div>
              <div class="gptt-field"><label>Existing named theme</label><select data-theme-select></select><div class="gptt-actions"><button class="gptt-secondary-button" data-action="load-named">Load</button><button class="gptt-secondary-button" data-action="overwrite-named">Overwrite</button></div></div>
              <div class="gptt-actions"><button class="gptt-danger-button" data-action="delete-named">Delete</button><button class="gptt-secondary-button" data-action="reset">Reset whole theme</button></div>
            </details>
          </section>
        </div>
      </div>
      <div class="gptt-toast" data-toast></div>`;
    document.documentElement.appendChild(editorRoot);
    wireEditor();
    refreshPresetRow();
    refreshSimpleFields();
    refreshAreaMenu();
    refreshFields();
    refreshBgControls();
    refreshThemeSelect();
    refreshHighlight();
  }

  function wireEditor() {
    const header = editorRoot.querySelector("[data-editor-drag-handle]");
    if (header) header.addEventListener("pointerdown", beginEditorDrag);
    editorRoot.addEventListener("click", async function (event) {
      const action = event.target && event.target.closest && event.target.closest("[data-action]") && event.target.closest("[data-action]").dataset.action;
      if (!action) return;
      const node = event.target.closest("[data-action]");
      if (action === "close") closeEditor();
      if (action === "toggle-enabled") await toggleEnabled();
      if (action === "toggle-area-picker") toggleAreaMenu();
      if (action === "choose-file") editorRoot.querySelector("[data-bg-file]").click();
      if (action === "clear-bg") { draftBackground.dataUrl = ""; draftBackground.hasImage = false; draftBackground.fileName = ""; applyAndPersist(); refreshBgControls(); toast("Background cleared"); }
      if (action === "reset") { draftTheme = Object.assign({}, NS.DEFAULT_CUSTOM_THEME || {}); draftBackground = Object.assign({}, NS.DEFAULT_BACKGROUND || {}); applyAndPersist(); refreshSimpleFields(); refreshFields(); refreshBgControls(); refreshPreview(); toast("Reset to defaults"); }
      if (action === "reset-area") resetSelectedArea();
      if (action === "reset-bg-opacity") { draftBackground.opacity = (NS.DEFAULT_BACKGROUND || {}).opacity ?? 0.45; applyAndPersist(); refreshBgControls(); toast("Reset opacity"); }
      if (action === "reset-bg-overlay") { draftBackground.overlayStrength = (NS.DEFAULT_BACKGROUND || {}).overlayStrength ?? 0.25; applyAndPersist(); refreshBgControls(); toast("Reset overlay"); }
      if (action === "reset-bg-blur") { draftBackground.blurPx = (NS.DEFAULT_BACKGROUND || {}).blurPx ?? 0; applyAndPersist(); refreshBgControls(); toast("Reset blur"); }
      if (action === "save-new") await saveNewTheme();
      if (action === "load-named") await loadNamedTheme();
      if (action === "overwrite-named") await overwriteNamedTheme();
      if (action === "delete-named") await deleteNamedTheme();
      if (action === "apply-preset") await applyThemeChoice(node.dataset.presetId);
      if (action === "select-area") selectArea(node.dataset.targetId);
    });
    document.addEventListener("click", closeAreaMenuOnOutside, true);
    const search = editorRoot.querySelector("[data-area-search]");
    if (search) search.addEventListener("input", refreshAreaMenu);
    editorRoot.querySelector("[data-bg-file]").addEventListener("change", handleFile);
    editorRoot.querySelector("[data-bg-scope]").addEventListener("change", e => { draftBackground.scope = e.target.value; applyAndPersist(); });
    editorRoot.querySelector("[data-bg-fit]").addEventListener("change", e => { draftBackground.fit = e.target.value; applyAndPersist(); });
    editorRoot.querySelector("[data-bg-opacity]").addEventListener("input", e => { draftBackground.opacity = Number(e.target.value); refreshBgLabels(); applyAndPersist(); });
    editorRoot.querySelector("[data-bg-overlay]").addEventListener("input", e => { draftBackground.overlayStrength = Number(e.target.value); refreshBgLabels(); applyAndPersist(); });
    editorRoot.querySelector("[data-bg-blur]").addEventListener("input", e => { draftBackground.blurPx = Number(e.target.value); refreshBgLabels(); applyAndPersist(); });
  }

  function closeAreaMenuOnOutside(event) {
    if (!editorRoot || editorRoot.contains(event.target)) return;
    const menu = editorRoot.querySelector("[data-area-menu]");
    if (menu) menu.hidden = true;
  }

  async function toggleEnabled() {
    state = state || await NS.loadFullState();
    const next = !(state && state.enabled !== false);
    state.enabled = next;
    if (NS.saveEnabled) await NS.saveEnabled(next);
    if (NS.applyThemeEngine) NS.applyThemeEngine(currentStateForEngine());
    const btn = editorRoot && editorRoot.querySelector('[data-action="toggle-enabled"]');
    if (btn) btn.textContent = next ? "Disable" : "Enable";
    toast(next ? "Theme enabled" : "Theme disabled");
  }

  async function applyThemeChoice(id) {
    if (!id) return;
    const current = await NS.loadFullState();
    const saved = (current.savedThemes || []).find(function (t) { return t.id === id; });
    if (saved) {
      await NS.saveActivePreset(id);
      state = await NS.loadFullState();
      draftTheme = Object.assign({}, NS.DEFAULT_CUSTOM_THEME || {}, NS.resolveTheme(state));
      draftBackground = Object.assign({}, NS.DEFAULT_BACKGROUND || {}, NS.resolveBackground(state));
      applyDraft();
      refreshSimpleFields();
      refreshFields();
      refreshBgControls();
      refreshPresetRow();
      refreshPreview();
      toast('Applied "' + saved.label + '"');
      return;
    }
    if (NS.getPresetTheme) {
      draftTheme = Object.assign({}, NS.DEFAULT_CUSTOM_THEME || {}, NS.getPresetTheme(id));
      state.activePresetId = 'custom';
      applyAndPersist();
      refreshSimpleFields();
      refreshFields();
      refreshPresetRow();
      refreshPreview();
      toast("Theme applied");
    }
  }

  function refreshPresetRow() {
    const row = editorRoot && editorRoot.querySelector("[data-preset-row]");
    if (!row || !NS.getAllThemeChoices) return;
    const current = state || {};
    const all = NS.getAllThemeChoices(current);
    const builtIns = all.filter(function (x) { return x.type === 'builtIn'; }).slice(0, 8);
    const saved = all.filter(function (x) { return x.type === 'saved'; });
    const ordered = builtIns.concat(saved);
    row.innerHTML = ordered.map(function (p) {
      const active = current.activePresetId === p.id;
      const kind = p.type === 'saved' ? 'Custom' : 'Built-in';
      return `<button class="gptt-preset-card" data-action="apply-preset" data-preset-id="${escapeAttr(p.id)}" data-kind="${escapeAttr(p.type)}" data-active="${active}" title="Apply ${escapeAttr(p.label)}">
        <span class="gptt-preset-label">${escapeHtml(p.label)}</span>
        <span class="gptt-preset-kind">${kind}</span>
        <span class="gptt-preset-apply">Apply</span>
      </button>`;
    }).join("");
  }

  function refreshSimpleFields() {
    const holder = editorRoot && editorRoot.querySelector("[data-simple-fields]");
    if (!holder || !draftTheme) return;
    holder.innerHTML = "";
    SIMPLE_CONTROLS.forEach(function (control) { holder.appendChild(linkedColorField(control.label, control.keys, control.hint)); });
  }

  function linkedColorField(label, keys, hint) {
    const wrap = document.createElement("div");
    wrap.className = "gptt-field gptt-linked-field";
    const first = keys.find(function (key) { return draftTheme[key]; }) || keys[0];
    const parts = parseCssColor(draftTheme[first], (NS.DEFAULT_CUSTOM_THEME || {})[first]);
    wrap.innerHTML = '<div class="gptt-label-row"><label>' + escapeHtml(label) + '</label><button class="gptt-reset-button" type="button" data-reset>Reset</button></div>' +
      (hint ? '<div class="gptt-control-hint">' + escapeHtml(hint) + '</div>' : '') +
      '<div class="gptt-color-row"><input type="color"><button class="gptt-secondary-button" type="button" data-transparent>Transparent</button></div>' +
      '<div class="gptt-alpha-row"><span>Transparency</span><input type="range" min="0" max="1" step="0.01"><strong></strong></div>';
    const input = wrap.querySelector('input[type="color"]');
    const alpha = wrap.querySelector('.gptt-alpha-row input');
    const amount = wrap.querySelector('.gptt-alpha-row strong');
    input.value = parts.hex; alpha.value = String(parts.alpha);
    function updateLabel() { amount.textContent = Math.round((1 - Number(alpha.value)) * 100) + "%"; }
    function commit() { const next = withAlpha(input.value, Number(alpha.value)); keys.forEach(function (key) { draftTheme[key] = next; }); updateLabel(); applyAndPersist(); schedulePreviewRefresh(); }
    updateLabel(); input.addEventListener("input", commit); alpha.addEventListener("input", commit);
    wrap.querySelector("[data-transparent]").addEventListener("click", function () { alpha.value = "0"; commit(); toast("Set transparent"); });
    wrap.querySelector("[data-reset]").addEventListener("click", function () { keys.forEach(function (key) { draftTheme[key] = (NS.DEFAULT_CUSTOM_THEME || {})[key]; }); refreshSimpleFields(); applyAndPersist(); schedulePreviewRefresh(); toast("Reset " + label); });
    return wrap;
  }

  function toggleAreaMenu() {
    const menu = editorRoot.querySelector("[data-area-menu]");
    menu.hidden = !menu.hidden;
    if (!menu.hidden) {
      const search = editorRoot.querySelector("[data-area-search]");
      if (search) { search.value = ""; refreshAreaMenu(); setTimeout(() => search.focus(), 0); }
    }
  }

  function selectArea(id) {
    if (!id) return;
    selectedTargetId = id;
    const menu = editorRoot.querySelector("[data-area-menu]");
    if (menu) menu.hidden = true;
    editorRoot.querySelector("[data-current-area]").textContent = targetById(id).label;
    editorRoot.querySelector("[data-target-desc]").textContent = targetById(id).description || "";
    refreshAreaMenu();
    refreshFields();
    refreshPreview();
    refreshHighlight();
  }

  function refreshAreaMenu() {
    if (!editorRoot) return;
    const list = editorRoot.querySelector("[data-area-list]");
    const searchNode = editorRoot.querySelector("[data-area-search]");
    if (!list) return;
    const q = (searchNode && searchNode.value || "").toLowerCase().trim();
    const filtered = targets().filter(t => !q || (t.label + " " + (t.description || "")).toLowerCase().includes(q));
    list.innerHTML = filtered.map(function (target) {
      return `<button class="gptt-area-item" data-action="select-area" data-target-id="${escapeAttr(target.id)}" data-active="${target.id === selectedTargetId}"><strong>${escapeHtml(target.label)}</strong><span>${escapeHtml(target.description || "")}</span></button>`;
    }).join("");
    const current = editorRoot.querySelector("[data-current-area]");
    if (current) current.textContent = targetById(selectedTargetId).label;
  }

  function refreshFields() {
    const target = targetById(selectedTargetId);
    const fields = target.fields || {};
    const holder = editorRoot.querySelector("[data-fields]");
    editorRoot.querySelector("[data-selected-pill]").textContent = target.label;
    holder.innerHTML = "";
    if (fields.background) holder.appendChild(colorField(FIELD_LABELS[fields.background] || "Background", fields.background));
    if (fields.text) holder.appendChild(colorField(FIELD_LABELS[fields.text] || "Text", fields.text));
    if (fields.border) holder.appendChild(colorField(FIELD_LABELS[fields.border] || "Border", fields.border));
    if (fields.radius) holder.appendChild(rangeField(FIELD_LABELS[fields.radius] || "Radius", fields.radius, 0, 40, 1, "px"));
    if (!holder.children.length) holder.innerHTML = '<p class="gptt-muted">This target is detected for highlighting, but no reliable editable control is exposed yet.</p>';
    refreshPreview();
  }

  function colorField(label, key) {
    const wrap = document.createElement("div");
    wrap.className = "gptt-field";
    const defaultValue = (NS.DEFAULT_CUSTOM_THEME || {})[key];
    const parts = parseCssColor(draftTheme[key], defaultValue);
    const isTransparent = parts.alpha <= 0.01;
    wrap.innerHTML = '<div class="gptt-label-row"><label>' + escapeHtml(label) + '</label><button class="gptt-reset-button" type="button" data-reset>Reset</button></div>' +
      '<div class="gptt-color-row"><input type="color"><button class="gptt-secondary-button" type="button" data-transparent>' + (isTransparent ? 'Transparent ✓' : 'Transparent') + '</button></div>' +
      '<div class="gptt-alpha-row"><span>Transparency</span><input type="range" min="0" max="1" step="0.01"><strong></strong></div>';
    const input = wrap.querySelector('input[type="color"]');
    const alpha = wrap.querySelector('.gptt-alpha-row input');
    const amount = wrap.querySelector('.gptt-alpha-row strong');
    input.value = parts.hex; alpha.value = String(parts.alpha);
    function updateLabel() { amount.textContent = Math.round((1 - Number(alpha.value)) * 100) + "%"; }
    function commit() { draftTheme[key] = withAlpha(input.value, Number(alpha.value)); updateLabel(); applyAndPersist(); schedulePreviewRefresh(); }
    updateLabel(); input.addEventListener("input", commit); alpha.addEventListener("input", commit);
    wrap.querySelector("[data-transparent]").addEventListener("click", function () { alpha.value = "0"; commit(); refreshFields(); toast("Set transparent"); });
    wrap.querySelector("[data-reset]").addEventListener("click", function () { draftTheme[key] = defaultValue; refreshFields(); applyAndPersist(); toast("Reset " + label); });
    return wrap;
  }

  function rangeField(label, key, min, max, step, suffix) {
    const wrap = document.createElement("div");
    wrap.className = "gptt-field";
    const defaultValue = clamp((NS.DEFAULT_CUSTOM_THEME || {})[key], min, max, min);
    const value = clamp(draftTheme[key], min, max, defaultValue);
    wrap.innerHTML = `<div class="gptt-label-row"><label>${escapeHtml(label)}: <span>${value}${suffix}</span></label><button class="gptt-reset-button" type="button" data-reset>Reset</button></div><input type="range" min="${min}" max="${max}" step="${step}" value="${value}">`;
    const span = wrap.querySelector("span");
    const input = wrap.querySelector("input");
    input.addEventListener("input", function () { draftTheme[key] = Number(input.value); span.textContent = input.value + suffix; applyAndPersist(); schedulePreviewRefresh(); });
    wrap.querySelector("[data-reset]").addEventListener("click", function () { draftTheme[key] = defaultValue; refreshFields(); applyAndPersist(); toast("Reset " + label); });
    return wrap;
  }

  function resetSelectedArea() {
    const target = targetById(selectedTargetId);
    const fields = target.fields || {};
    Object.keys(fields).forEach(function (kind) {
      const key = fields[kind];
      if (typeof key === "string" && Object.prototype.hasOwnProperty.call(NS.DEFAULT_CUSTOM_THEME || {}, key)) {
        draftTheme[key] = (NS.DEFAULT_CUSTOM_THEME || {})[key];
      }
    });
    refreshFields();
    applyAndPersist();
    toast("Area reset");
  }

  async function handleFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("Choose an image file");
    const dataUrl = await fileToDataUrl(file);
    draftBackground.dataUrl = dataUrl;
    draftBackground.hasImage = true;
    draftBackground.fileName = file.name;
    if (!draftBackground.opacity) draftBackground.opacity = 0.45;
    applyAndPersist();
    refreshBgControls(file.name);
    toast("Background image applied");
    event.target.value = "";
  }

  function refreshBgControls(fileNameOverride) {
    if (!editorRoot || !draftBackground) return;
    editorRoot.querySelector("[data-bg-scope]").value = draftBackground.scope || "chat";
    editorRoot.querySelector("[data-bg-fit]").value = draftBackground.fit || "cover";
    editorRoot.querySelector("[data-bg-opacity]").value = typeof draftBackground.opacity === "number" ? draftBackground.opacity : 0.45;
    editorRoot.querySelector("[data-bg-overlay]").value = typeof draftBackground.overlayStrength === "number" ? draftBackground.overlayStrength : 0.25;
    editorRoot.querySelector("[data-bg-blur]").value = typeof draftBackground.blurPx === "number" ? draftBackground.blurPx : 0;
    const name = fileNameOverride || draftBackground.fileName || (draftBackground.hasImage || draftBackground.dataUrl ? "Saved background image" : "No image selected");
    editorRoot.querySelector("[data-file-name]").textContent = name;
    refreshBgLabels();
  }

  function refreshBgLabels() {
    if (!editorRoot) return;
    editorRoot.querySelector("[data-opacity-label]").textContent = Math.round(Number(editorRoot.querySelector("[data-bg-opacity]").value) * 100) + "%";
    editorRoot.querySelector("[data-overlay-label]").textContent = Math.round(Number(editorRoot.querySelector("[data-bg-overlay]").value) * 100) + "%";
    editorRoot.querySelector("[data-blur-label]").textContent = editorRoot.querySelector("[data-bg-blur]").value + "px";
  }

  async function refreshThemeSelect() {
    if (!editorRoot) return;
    const select = editorRoot.querySelector("[data-theme-select]");
    const current = await NS.loadFullState();
    state = current;
    const saved = current.savedThemes || [];
    select.innerHTML = saved.length ? saved.map(t => `<option value="${escapeAttr(t.id)}">${escapeHtml(t.label)}</option>`).join("") : '<option value="">No named themes saved</option>';
  }

  async function saveNewTheme() {
    const input = editorRoot.querySelector("[data-new-theme-name]");
    const label = input.value.trim();
    if (!label) return toast("Enter a theme name first");
    await NS.saveNamedTheme(label, draftTheme, draftBackground);
    state = await NS.loadFullState();
    input.value = "";
    await refreshThemeSelect();
    refreshPresetRow();
    toast(`Saved "${label}"`);
  }

  async function loadNamedTheme() {
    const id = editorRoot.querySelector("[data-theme-select]").value;
    if (!id) return toast("No named theme selected");
    await NS.saveActivePreset(id);
    state = await NS.loadFullState();
    draftTheme = Object.assign({}, NS.DEFAULT_CUSTOM_THEME || {}, NS.resolveTheme(state));
    draftBackground = Object.assign({}, NS.DEFAULT_BACKGROUND || {}, NS.resolveBackground(state));
    applyDraft();
    refreshFields();
    refreshBgControls();
    refreshPreview();
    toast("Named theme loaded");
  }

  async function overwriteNamedTheme() {
    const id = editorRoot.querySelector("[data-theme-select]").value;
    if (!id) return toast("No named theme selected");
    await NS.updateNamedTheme(id, draftTheme, draftBackground);
    await refreshThemeSelect();
    toast("Named theme updated");
  }

  async function deleteNamedTheme() {
    const id = editorRoot.querySelector("[data-theme-select]").value;
    if (!id) return toast("No named theme selected");
    await NS.deleteSavedTheme(id);
    await refreshThemeSelect();
    state = await NS.loadFullState();
    refreshPresetRow();
    toast("Named theme deleted");
  }

  function refreshPreview() {
    if (!editorRoot || !draftTheme) return;
    const card = editorRoot.querySelector("[data-preview-card]");
    if (!card) return;
    const target = targetById(selectedTargetId);
    const t = draftTheme;
    if (selectedTargetId.indexOf("sidebar") === 0) {
      card.innerHTML = `<div class="gptt-preview-sidebar" style="background:${safeCss(t.sidebarBg)};color:${safeCss(t.sidebarText)}"><div style="background:${safeCss(t.sidebarItemBg)};color:${safeCss(t.sidebarItemText)};border-color:${safeCss(t.sidebarItemBorder)};border-radius:${t.sidebarItemRadiusPx || 12}px">✦ Search chats</div><div style="color:${safeCss(t.sidebarItemText)}">○ Deep research</div></div>`;
    } else if (selectedTargetId === "user.message") {
      card.innerHTML = `<div class="gptt-preview-chat"><div class="gptt-preview-bubble user" style="background:${safeCss(t.userBubbleBg)};color:${safeCss(t.userBubbleText)};border-radius:${t.borderRadiusPx || 12}px">User message preview</div></div>`;
    } else if (selectedTargetId === "button.send" || selectedTargetId === "composer.input" || selectedTargetId === "bottom.dock") {
      card.innerHTML = `<div class="gptt-preview-composer" style="background:${safeCss(t.bottomDockBg)}"><div class="gptt-preview-input" style="background:${safeCss(t.composerInputBg)};color:${safeCss(t.composerText)};border-color:${safeCss(t.composerBorder)};border-radius:${t.composerRadiusPx || 24}px"><span>Message ChatGPT</span><button style="background:${safeCss(t.sendButtonBg)};color:${safeCss(t.sendButtonText)};border-radius:${t.sendButtonRadiusPx || 999}px">↑</button></div></div>`;
    } else if (selectedTargetId === "code.block") {
      card.innerHTML = `<pre class="gptt-preview-code" style="background:${safeCss(t.codeBlockBg)};color:${safeCss(t.codeText)};border-color:${safeCss(t.codeBorder)}">const theme = "ready";</pre>`;
    } else {
      card.innerHTML = `<div class="gptt-preview-chat" style="background:${safeCss(t.chatAreaBg)};color:${safeCss(t.primaryText)}"><div class="gptt-preview-text"><strong>${escapeHtml(target.label)}</strong><span>Preview sample text and surface.</span></div></div>`;
    }
  }

  function parseCssColor(value, fallback) {
    const raw = String(value || fallback || "#000000").trim();
    const hex = /^#([0-9a-f]{6})$/i.exec(raw); if (hex) return { valid: true, hex: "#" + hex[1], alpha: 1 };
    const short = /^#([0-9a-f]{3})$/i.exec(raw); if (short) return { valid: true, hex: "#" + short[1].split("").map(function (c) { return c + c; }).join(""), alpha: 1 };
    const rgba = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([0-9.]+))?\s*\)$/i.exec(raw);
    if (rgba) { const r=Math.max(0,Math.min(255,Number(rgba[1]))), g=Math.max(0,Math.min(255,Number(rgba[2]))), b=Math.max(0,Math.min(255,Number(rgba[3]))), a=rgba[4]==null?1:Math.max(0,Math.min(1,Number(rgba[4]))); return { valid: true, hex: "#" + [r,g,b].map(function(n){return n.toString(16).padStart(2,"0");}).join(""), alpha: a }; }
    if (raw === "transparent") return { valid: true, hex: parseCssColor(fallback || "#000000", "#000000").hex, alpha: 0 };
    return { valid: false, hex: parseCssColor(fallback || "#000000", "#000000").hex, alpha: 1 };
  }

  function withAlpha(hex, alphaValue) {
    const parts = parseCssColor(hex, "#000000"); const a = Math.max(0, Math.min(1, Number(alphaValue)));
    const r = parseInt(parts.hex.slice(1,3),16), g = parseInt(parts.hex.slice(3,5),16), b = parseInt(parts.hex.slice(5,7),16);
    if (a >= 0.995) return parts.hex; if (a <= 0.005) return "rgba(" + r + "," + g + "," + b + ",0)"; return "rgba(" + r + "," + g + "," + b + "," + Math.round(a * 100) / 100 + ")";
  }

  function safeCss(value) { return String(value || "transparent").replace(/[;{}]/g, ""); }

  function targetElements(target) {
    if (!target) return [];
    if (typeof target.getHighlightElements === "function") {
      try { return target.getHighlightElements(document.body).filter(Boolean); } catch (_) {}
    }
    const out = [];
    (target.selectors || []).forEach(sel => { try { document.querySelectorAll(sel).forEach(el => out.push(el)); } catch (_) {} });
    return Array.from(new Set(out)).filter(el => el instanceof Element && !editorRoot?.contains(el));
  }

  function clearHighlights() { highlights.forEach(h => h.remove()); highlights = []; }
  function visibleRect(el) { const r = el.getBoundingClientRect(); return r.width > 3 && r.height > 3 && r.bottom >= 0 && r.top <= innerHeight && r.right >= 0 && r.left <= innerWidth ? r : null; }
  function highlightTarget(target) {
    clearHighlights();
    targetElements(target).slice(0, 60).forEach(el => {
      const r = visibleRect(el); if (!r) return;
      const h = document.createElement("div");
      h.className = "gptt-multi-highlight";
      h.style.left = Math.max(0, r.left) + "px"; h.style.top = Math.max(0, r.top) + "px";
      h.style.width = Math.max(0, r.width) + "px"; h.style.height = Math.max(0, r.height) + "px";
      h.style.borderRadius = getComputedStyle(el).borderRadius || "12px";
      document.documentElement.appendChild(h); highlights.push(h);
    });
  }
  function refreshHighlight() { if (editorRoot) highlightTarget(targetById(selectedTargetId)); }

  function toast(message) {
    const node = editorRoot && editorRoot.querySelector("[data-toast]");
    if (!node) return;
    node.textContent = message; node.dataset.visible = "true"; clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.dataset.visible = "false", 1700);
  }

  function fileToDataUrl(file) { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result || "")); r.onerror = reject; r.readAsDataURL(file); }); }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch])); }
  function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }


  function applyLauncherPosition() {
    if (!launcher) return;
    if (launcherPosition && Number.isFinite(launcherPosition.x) && Number.isFinite(launcherPosition.y)) {
      const x = Math.max(8, Math.min(innerWidth - 58, launcherPosition.x));
      const y = Math.max(8, Math.min(innerHeight - 58, launcherPosition.y));
      launcher.style.left = x + "px";
      launcher.style.top = y + "px";
      launcher.style.right = "auto";
      launcher.style.bottom = "auto";
    }
  }

  function beginLauncherDrag(event) {
    if (event.button !== 0) return;
    if (event.target && event.target.closest && event.target.closest(".gptt-launcher-close")) return;
    const rect = launcher.getBoundingClientRect();
    launcherDrag = { startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, moved: false };
    launcher.setPointerCapture?.(event.pointerId);
    const move = function (e) {
      if (!launcherDrag) return;
      const dx = e.clientX - launcherDrag.startX;
      const dy = e.clientY - launcherDrag.startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) launcherDrag.moved = true;
      launcherPosition = { x: Math.max(8, Math.min(innerWidth - 58, launcherDrag.left + dx)), y: Math.max(8, Math.min(innerHeight - 58, launcherDrag.top + dy)) };
      applyLauncherPosition();
    };
    const up = function () {
      if (launcherPosition) { try { chrome.storage.local.set({ cgptUi_launcherPosition: launcherPosition }); } catch (_) {} }
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      setTimeout(function () { if (launcherDrag) launcherDrag = null; }, 0);
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
  }

  function hideLauncher(event) {
    if (event) event.stopPropagation();
    launcherHidden = true;
    try { chrome.storage.local.set({ cgptUi_launcherHidden: true }); } catch (_) {}
    if (launcher) launcher.remove();
    launcher = null;
    toast("Launcher hidden. Reopen from the extension icon.");
  }

  function beginEditorDrag(event) {
    if (event.button !== 0) return;
    if (event.target && event.target.closest && event.target.closest("button, input, select, textarea, summary")) return;
    const rect = editorRoot.getBoundingClientRect();
    editorDrag = { startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top };
    const move = function (e) {
      if (!editorDrag || !editorRoot) return;
      const x = Math.max(8, Math.min(innerWidth - 80, editorDrag.left + e.clientX - editorDrag.startX));
      const y = Math.max(8, Math.min(innerHeight - 80, editorDrag.top + e.clientY - editorDrag.startY));
      editorRoot.style.left = x + "px";
      editorRoot.style.top = y + "px";
      editorRoot.style.right = "auto";
    };
    const up = function () {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      editorDrag = null;
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
  }

  NS.openThemeBuilder = openEditor;

  NS.syncThemeBuilder = function syncThemeBuilder() { ensureLauncher(); };

  try { chrome.storage.local.get(["cgptUi_launcherHidden", "cgptUi_launcherPosition"], function (data) { launcherHidden = !!data.cgptUi_launcherHidden; launcherPosition = data.cgptUi_launcherPosition || null; ensureLauncher(); }); } catch (_) { ensureLauncher(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureLauncher, { once: true });
  else ensureLauncher();
})(typeof globalThis !== "undefined" ? globalThis : this);
