
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
  const presetList = document.getElementById("preset-list");
  const enabledEl = document.getElementById("enabled");
  const openOptions = document.getElementById("open-options");
  const customNote = document.getElementById("custom-note");
  const openBuilder = document.getElementById("open-builder");

  function labelForChoice(choice) {
    return choice.type === "saved" ? "★ " + choice.label : choice.label;
  }

  function renderThemes(state) {
    presetList.innerHTML = "";
    const all = NS.getAllThemeChoices(state);
    const map = Object.create(null);
    all.forEach(function (choice) { map[choice.id] = choice; });
    const ids = state.quickThemeIds && state.quickThemeIds.length ? state.quickThemeIds : all.map(function (x) { return x.id; });
    const visible = ids.map(function (id) { return map[id]; }).filter(Boolean);

    if (!visible.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "No quick themes selected. Open options to add some.";
      presetList.appendChild(empty);
      return;
    }

    visible.forEach(function (choice) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "preset-btn" + (choice.id === state.activePresetId ? " active" : "");
      btn.textContent = labelForChoice(choice);
      btn.addEventListener("click", function () {
        NS.saveActivePreset(choice.id).then(function () {
          state.activePresetId = choice.id;
          renderThemes(state);
          customNote.hidden = true;
        });
      });
      presetList.appendChild(btn);
    });
  }

  NS.loadFullState().then(function (state) {
    enabledEl.checked = !!state.enabled;
    customNote.hidden = state.activePresetId !== "custom";
    renderThemes(state);
  }).catch(function () {
    enabledEl.checked = true;
    presetList.textContent = "Could not load theme settings.";
  });

  enabledEl.addEventListener("change", function () {
    NS.saveEnabled(enabledEl.checked);
  });

  openBuilder.addEventListener("click", function () {
    NS.storageSet({ [NS.STORAGE_KEYS.themeBuilderRequest]: Date.now() });
    window.close();
  });

  openOptions.addEventListener("click", function (e) {
    e.preventDefault();
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
  });
})();
