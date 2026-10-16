# GPT Themes

A Manifest V3 browser extension for customizing ChatGPT with themes, background images, and a custom sidebar logo. It styles the existing interface while preserving native controls and navigation.

Current version: **0.8.31**. See [release notes](RELEASE_NOTES.md) for the latest changes and validation details.

## Install

Load the extension unpacked in Chrome or Microsoft Edge. No build step is required.

1. Clone this repository or extract a release ZIP.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the folder containing `manifest.json`.
5. Open or refresh ChatGPT, then click the GPT Themes extension icon.

To update an existing installation, replace its files in the same folder, click **Reload** on the extension's card, and refresh ChatGPT. Existing settings remain in extension storage.

## Features

- Built-in themes, custom colors, named themes, and a configurable popup quick-theme list.
- An in-page Theme Builder with previews and controls for individual interface areas.
- Background images with opacity, blur, overlay, positioning, and fit controls; apply them to the chat area or the full page.
- Separate styling for the sidebar, header, composer, message bubbles, buttons, and code blocks.
- Sidebar logo options: show the original, hide it, or replace it with a custom image.
- Ctrl/Cmd-click and middle-click support for supported ChatGPT navigation, including chats, projects, New chat, Library, Scheduled, and Plugins.
- Compatibility handling for composer footers, file/image viewer toolbars, menus, and semantic code blocks.

## Customize ChatGPT

Click the extension icon to choose a quick theme, enable or disable the extension, or open **Theme Builder**. The floating GPT Themes launcher also opens the builder. Drag its launcher or the editor header to reposition it.

Choose **Themes, logo & settings…** in the popup for the full settings page. There you can edit and save a custom theme, manage background images, save named quick themes, and choose which themes appear in the popup.

### Change the sidebar logo

In the settings page, open **ChatGPT logo** and choose:

- **Show original logo** — the default.
- **Hide original logo** — hide only the ChatGPT wordmark.
- **Replace ChatGPT logo with custom image** — select an image and save the logo settings.

Search, the sidebar toggle, and the mode menu remain usable. Logo preferences apply across themes.

Uploads are resized locally to at most 240 × 56 pixels and saved as PNG. The displayed image fits the original logo area, capped at 120 × 28 CSS pixels, without stretching or cropping. Images must be smaller than 20 MB.

### Reset settings

Use the settings page's **Reset everything to defaults** button to clear custom settings, saved themes, background images, and the custom logo. Theme Builder's area/theme reset controls affect its theme settings rather than all extension preferences.

## Storage and permissions

Preferences and uploaded images are stored locally using `chrome.storage.local`. The extension does not upload them or make network requests.

The manifest requests:

- `storage` to save preferences.
- `unlimitedStorage` to accommodate uploaded background images.
- Access to `https://chatgpt.com/*` and `https://chat.openai.com/*` to apply the extension on those sites.

## Development

The extension uses plain JavaScript, HTML, and CSS, with no compilation step or runtime dependency installation.

| Location | Purpose |
| --- | --- |
| `manifest.json` | Version, permissions, and script loading order |
| `shared/` | Defaults, presets, and local storage |
| `content/` | Theme engine, Theme Builder, logo handling, and compatibility guards |
| `background/` | Validated new-tab navigation requests |
| `popup/` | Quick themes and settings access |
| `options/` | Full settings and image uploads |
| `assets/` | Extension icons |
| `tests/` | Node tests and optional browser checks |

After editing extension files, reload the extension and refresh the ChatGPT tab. Generated `GPT-Themes-*.zip` archives, temporary files, and local dependencies are excluded by `.gitignore`.

### Tests

Run the unit/regression tests with Node.js 18 or later:

```powershell
node --test tests/branding-storage.test.js tests/code-block-guard.test.js tests/navigation-tab-guard.test.js
```

Optional browser checks require Playwright and installed Microsoft Edge. Install the test dependency locally:

```powershell
npm install --no-save --package-lock=false playwright
```

Then run:

```powershell
node tests/logo-options.browser.cjs
node tests/viewer-branding.browser.cjs "C:\path\to\saved-viewer.html"
node tests/composer-compatibility.browser.cjs "C:\path\to\saved-conversation.html"
```

The viewer test expects a saved ChatGPT page with a file/image viewer open. The composer test expects a saved conversation with the corresponding composer and code-block elements. Saved pages are external fixtures and are not included in this repository. The checks block remote requests and prevent saved-page scripts from running; they do not exercise an authenticated live ChatGPT session.

## Troubleshooting

- **Changes do not appear:** reload the extension, refresh ChatGPT, and check that the popup's enable toggle is on.
- **The floating launcher is hidden:** use **Open Theme Builder** in the extension popup.
- **A custom logo does not appear:** choose replacement mode, select a valid image, and click **Save logo settings**.
- **A ChatGPT update breaks styling:** capture a screenshot and save an HTML example of the affected view. Remove sensitive conversation content before sharing it. ChatGPT's DOM changes can require updates to compatibility selectors.
