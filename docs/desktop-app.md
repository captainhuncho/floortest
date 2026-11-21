# Desktop app (Mac and Windows): plan

Plan only, for the owner's choices (20 Nov 2026). Nothing is installed or built yet. The owner's ask, in the hub: "for
macbook and window. iPhone app but macbook is landscape so let's be mindful of screen dimensions".

## What we already have
- The iPhone and Android apps are a thin shell around floortest.app (`mobile/`, Capacitor). The desktop app should be
  the same idea: a window that opens floortest.app/dashboard/floor, with a few native extras.
- The website already has a full desktop layout from 1024px up: the side rail (`SidebarRail.tsx`, `Sidebar.tsx`), the
  laptop player bar and expanded player, the decision rail. A desktop window shows that layout; the phone layout is
  never stretched.

## The three routes

| | Tauri 2 (Mac + Windows) | Electron (Mac + Windows) | iPhone app on Mac ("Designed for iPad" / Catalyst) + a separate Windows app |
|---|---|---|---|
| How it works | Small Rust shell; the system web view (Safari's on Mac, Edge WebView2 on Windows) | Ships its own Chromium and Node | The App Store iPhone/iPad build runs on Apple-silicon Macs; Windows still needs Tauri, Electron or the installable website |
| Download size | About 5-15 MB | About 90-150 MB | Mac: nothing extra. Windows: depends on the route chosen |
| Memory | Lowest (shared system web view) | Highest (its own Chromium per app) | Like the iPhone app |
| Updates | Signed updater plugin (`tauri-plugin-updater`), files from our own server or GitHub Releases | `electron-updater` | Mac: through the App Store. Windows: its own |
| Signing | Apple Developer ID + notarisation for Mac; a Windows code-signing certificate (or Microsoft Trusted Signing) | Same | Mac: App Store signing already covered by the iPhone app. Windows: a certificate |
| Stores | Direct download first; Mac App Store and Microsoft Store possible later | Same | Mac App Store only |
| Payments | Outside the stores: the web plans (allowed for direct downloads). In the Mac App Store it would need Apple in-app purchase: RevenueCat has no Tauri SDK, so it would need its own work | Same; Electron has a built-in `inAppPurchase` for the Mac App Store, but RevenueCat has no Electron SDK | Mac: the iPhone app's RevenueCat purchases and Restore work as they are |
| Feels on Mac | Native window, real menu bar, keyboard shortcuts, resizable | Same | An iPad app in a window: iPad-style menus, limited window sizes, weakest Mac feel |
| Risks | Downloads (Prepare exports, track downloads) and file drag-and-drop need checking in each system web view; Safari's web view on older macOS | Size and memory on cheap laptops; Chromium security updates are ours to ship | Feels like a phone app; Windows needs a second product anyway |

## Recommendation
**Tauri 2 for both Mac and Windows, sold as a direct download, with the web plans.**
1. One small, fast app for both systems, the same thin-shell idea as the phone apps, and the lightest on cheap laptops
   (owner's "App speed" rule).
2. Outside the stores, the website's plans can be used directly, so no second purchase system is needed.
3. The website's existing desktop layout is the app's layout; there's nothing to redesign.
4. Later and optional: once the iPhone app is live, also tick "available on Mac" in App Store Connect. That costs
   almost nothing and uses the RevenueCat purchases already built. Not a replacement for the real Mac app.

Not Electron: 10x the download and much more memory for no feature we need. Not the iPhone app alone: it doesn't
cover Windows and doesn't feel like a Mac app.

## Desktop layout (landscape, 1024px up to large monitors)
- The window opens at 1280x800, can be resized down to 1024x640 (the website's desktop layout starts at 1024px; below
  that the window can't shrink), and remembers its size and place (`tauri-plugin-window-state`).
- The website's desktop layout as it is: side rail, laptop player bar, expanded player as a centred card. Content
  stops at a readable width on very wide monitors (no stretched lists); checked at 1024, 1280, 1440, 1920 and 2560 wide.
- Keyboard and mouse first: the Queue's keys (Space play/pause, K/N, arrows) keep working; standard shortcuts (Cmd/Ctrl+F
  search, Cmd/Ctrl+, settings, Cmd/Ctrl+W close window, Cmd/Ctrl+R reload); a real menu bar (FloorTest, File, Edit,
  View, Playback, Window, Help) with the same actions, so nothing needs hover alone.
- Media keys and the system Now Playing work through the web Media Session where the system web view supports it;
  checked on both systems.
- Drag files from Finder or Explorer onto Projects or a callout to upload (the website's own drop handling; the shell
  lets the page take the drop).
- Light and dark follow the system; reduced motion respected; pull to refresh: trackpad pill and mouse drag as on
  the website.
- Links outside floortest.app open in the normal browser; only floortest.app opens inside (same rule as the phone apps).

## Packages each route needs (vetted 20 Nov, npm registry and crates.io)

**Tauri (recommended):**
- `@tauri-apps/cli` 2.12.6: Tauri team (tauri-apps/tauri), Apache-2.0 or MIT, ~4.8M downloads/week, since Apr 2021. No
  install script; a prebuilt binary for each system comes as an optional package.
- `@tauri-apps/api` 2.12.5: same publisher and repo, ~5.3M/week, since 2021, no install script.
- `@tauri-apps/plugin-updater` 2.14.1 and `@tauri-apps/plugin-window-state` 2.5.0: tauri-apps/plugins-workspace,
  ~1.5M and ~148k/week, since 2023, no install scripts.
- Rust crates (crates.io, same repos): `tauri` 2.12.7 (~19M recent downloads), `tauri-build` 2.7.6,
  `tauri-plugin-updater` 2.14.1, `tauri-plugin-window-state` 2.5.0, `tauri-plugin-single-instance` 2.5.5.
- Look-alike warning: `tauri-plugin-single-instance` exists only as a Rust crate. There is no
  `@tauri-apps/plugin-single-instance` on npm (404 checked); anything by that name elsewhere would be fake.

**Electron (not recommended):**
- `electron` 45.4.1: Electron (OpenJS), MIT, ~12.9M/week, since 2012. Fetches a ~100 MB Chromium build from GitHub
  through `@electron/get` during setup.
- `electron-builder` 26.18.0 and `electron-updater` 6.8.11: electron-userland, MIT, ~8.8M and ~6.7M/week, since 2015.

**iPhone app on Mac:** no new packages (a setting in App Store Connect); the Windows half still needs one of the above.

## Owner only
Choosing the route; an Apple Developer ID certificate and notarisation (the Apple account from the iPhone app); a
Windows code-signing certificate or Microsoft Trusted Signing (paid); where updates are hosted; the download page and
its wording; store listings if any; the package yes.

## Steps once approved (one small PR each, own branch)
1. `desktop/` folder: Tauri shell that opens floortest.app/dashboard/floor, only floortest.app inside, no app
   commands open to the website (Tauri's permissions deny by default), window size and limits, single instance.
2. Menu bar and shortcuts; external links to the browser; downloads and file drops checked on both systems.
3. Updater (signed updates) and the Mac/Windows build in CI, unsigned until the owner's certificates exist.
4. Checks: every size above, both themes, keyboard only, VoiceOver and Narrator, slow-laptop pass; evidence report.
5. Download page on the website (wording the owner's).

## Proposed goal change (for the owner's yes; not in goal.md yet)
Add to "What done looks like": "A desktop app for Mac and Windows (Tauri, direct download) opens FloorTest in a
resizable landscape window with the website's desktop layout, a menu bar and keyboard shortcuts, signed updates, and
the web plans." Add to "In scope": "The desktop app (`desktop/`)". Add to "Always the owner's": "Signing certificates
and the download page."
