/* Keep native mode/search/sidebar controls; change only the ChatGPT artwork. */
(function initBranding(global) {
  const NS = (global.CgptUiEnhancer = global.CgptUiEnhancer || {});
  const managed = new Map();
  const failedImages = new Set();
  let observer = null;
  let frame = 0;
  let settings = { mode: "original", dataUrl: "" };
  const scopes = "#app-shell-sidebar .h-toolbar, #sidebar-header, [data-app-shell-header-slot='start']";

  function restore(original, record) {
    original.classList.remove("gptt-brand-original-hidden");
    if (record.image) record.image.remove();
    managed.delete(original);
  }

  function refresh() {
    frame = 0;
    if (settings.mode === "custom" && failedImages.has(settings.dataUrl)) settings = { mode: "original", dataUrl: "" };
    for (const [original, record] of managed) {
      if (!original.isConnected || settings.mode === "original") restore(original, record);
    }
    if (settings.mode === "original") return;
    document.querySelectorAll(scopes).forEach(function (scope) {
      scope.querySelectorAll("svg[role='img']").forEach(function (original) {
        const label = original.getAttribute("aria-label") || "";
        const text = original.parentElement.querySelector(".sr-only");
        if (label !== "ChatGPT" && (!text || text.textContent.trim() !== "ChatGPT")) return;
        let record = managed.get(original);
        if (!record) {
          const rect = original.getBoundingClientRect();
          record = { width: Math.min(120, rect.width || 88), height: Math.min(28, rect.height || 22), image: null };
          managed.set(original, record);
        }
        if (settings.mode === "custom" && settings.dataUrl) {
          if (!record.image) {
            record.image = document.createElement("img");
            record.image.className = "gptt-brand-custom";
            record.image.alt = ""; // Native accessible mode label stays intact.
            record.image.setAttribute("aria-hidden", "true");
            record.image.style.setProperty("--gptt-brand-width", record.width + "px");
            record.image.style.setProperty("--gptt-brand-height", record.height + "px");
            record.image.onerror = function () { failedImages.add(record.image.src); restore(original, record); };
            original.after(record.image);
          }
          if (record.image.getAttribute("src") !== settings.dataUrl) record.image.src = settings.dataUrl;
          original.classList.add("gptt-brand-original-hidden");
        } else if (settings.mode === "hidden") {
          if (record.image) { record.image.remove(); record.image = null; }
          original.classList.add("gptt-brand-original-hidden");
        }
      });
    });
  }

  NS.applyBranding = function applyBranding(state) {
    settings = state && state.enabled !== false && NS.normalizeBranding
      ? NS.normalizeBranding(state.branding) : { mode: "original", dataUrl: "" };
    if (settings.mode === "custom" && !settings.dataUrl) settings.mode = "original";
    if (observer) { observer.disconnect(); observer = null; }
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    refresh();
    if (settings.mode !== "original" && document.body) {
      observer = new MutationObserver(function () {
        if (!frame) frame = requestAnimationFrame(refresh);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
