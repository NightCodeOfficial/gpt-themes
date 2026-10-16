# GPT Themes 0.8.31

- Restore file/image viewer actions: prevent the full-width app-shell titlebar background from covering the native viewer toolbar. Resume the configured conversation header background after the viewer closes. Preserve the existing composer/footer fixes.
- Add ChatGPT logo settings: show original, hide original, or replace with a custom local image. Open the extension popup, choose **Themes, logo & settings**, then **ChatGPT logo**.
- Keep the original mode-menu button, dropdown, Search, and sidebar controls. Replace only ChatGPT artwork and preserve its accessible label. Reapply branding when the sidebar remounts; restore the original when disabled.
- Resize uploads locally to at most 240 × 56 pixels for sharp display within the original logo area (capped at 120 × 28 CSS pixels). Preserve aspect ratio, use contain fitting, and normalize to PNG. Logo preferences apply across themes and are cleared by Reset everything.
- No new extension permissions or network calls.

Validation: 49 Node regression tests passed, plus headless Edge checks of the supplied viewer snapshot, the earlier composer snapshot, and the options-page upload/save workflow. Checks cover viewer painting with solid and image themes, closing the viewer, branding hide/replace/disable/remount, preserved native controls, wide/tall upload resizing, storage, invalid-image handling, and the prior composer fix. Saved-page scripts and remote requests were blocked. Authenticated live ChatGPT behavior was not exercised; external SVG icon sprites are unavailable in the offline snapshots.

Reload the existing unpacked extension, then refresh ChatGPT. For a fresh installation, extract the ZIP and load that folder as an unpacked extension. Existing settings are preserved; the original logo remains the default.

Optional browser tests (Playwright and installed Edge required):
- `node tests/viewer-branding.browser.cjs <saved-viewer.html>`
- `node tests/logo-options.browser.cjs`
- `node tests/composer-compatibility.browser.cjs <saved-conversation.html>`

Saved example pages and user images are not included in the distribution.
