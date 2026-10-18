# Desktop Cat — project handoff / instructions for Claude Code

This file is read automatically by Claude Code. It holds the brief (with the user's later
changes), the decisions made, how the app is built, the pitfalls already hit (and their fixes),
and what is still unverified. **All 11 planned stages are built** (2026-10-18) and the user tested the
new version themselves and said "all good". **Next: publish to GitHub** following docs/PUBLISHING.md
(the user will do it in a new chat; they have no GitHub account yet).

## Who the user is and how to work with them

- Complete beginner: first time coding, no GitHub account yet, on **Windows 10 (x64)**, one 1920×1080
  display. The app must also run on macOS from the same codebase.
- **Teach as you go**: before each step, explain in plain language what we're doing and *why*,
  then give the exact files or commands. Short explanations, never skip the "why".
- Work in **small working stages**; after each, tell them how to run it and what they should see.
- Warn in advance when something may behave differently on Mac vs Windows.
- Terminal: VS Code (PowerShell) inside `Documents\desktop-cat`. They run **`npm.cmd start`**
  (execution policy not changed). VS Code window is narrow → Terminal menu is under "…" (or Ctrl+`).
- The user often has an `npm start` instance running while we test — test wrappers must not rely on
  their windows, and their instance may run old code (tell them to restart it after changes).
- App name **Desktop Cat**, repo `desktop-cat`, license **MIT**. Author/copyright are still the
  placeholder **"Your Name"** in `LICENSE` and `package.json` (docs/PUBLISHING.md step 0 tells them).

## The brief, as changed by the user

Original: a small cute orange tabby (white chest/muzzle, pink nose and inner ears) that lives on the
desktop: walks along the bottom of the screen, idles (sit/groom/stretch/yawn), sleeps with "zzz",
chases the cursor, climbs onto windows, can be dragged and dropped (falls/lands), reacts to clicks
(hop, purr, heart), meows (mute toggle), treats ("Give treat"), attention-seeking personality.
Click-through except the cat; optional **Mischief mode** (OFF by default; nudge the cursor a short
distance, never click/type, back off when the user moves the mouse; macOS Accessibility). Always on
top, lightweight, multi-monitor. Tray/menu-bar icon: Show/Hide, Give treat, Pause, Mute, Mischief,
Cat size (S/M/L), Walking speed, Launch at startup, Quit; settings remembered. Publishing: public
GitHub repo, README (screenshot/GIF placeholder, install, unknown-developer warnings, run from source,
swap the art), MIT with one-line justification, Windows .exe + macOS .dmg/.zip via GitHub Actions on
release, step-by-step GitHub walkthrough (GitHub Desktop).

**User changes (all 2026-10-18) — these override the original brief:**
- **No pixel art.** Smooth, fluffy, adorable cartoon kitten drawn live with vector shapes
  (`src/renderer/kitten.js`), smooth animation. Big glossy **black** eyes with white sparkles.
- **Lives in the bottom corners** (left/right). Goes elsewhere only when dragged ("play mode": stays
  near the drop spot until its next nap, then returns to the nearest corner).
- **No synthesized sounds** (they were "scary"). Silent unless the user adds recordings to
  `assets/sounds/`; "Mute sounds" only appears in the menu when recordings exist.
- **Hearts**: abstract/lopsided, only 1–2 per click.
- **Falling animation** when dropped from high up (flail, wind streaks, squish + dust, dizzy).
- **Play mode**: food bowl, fish treat, bathtub (bubbles, rubber duck), woolly yarn ball to throw.
- **Cat tree** like their reference photo (wooden trunk, slab platforms, bowl bed, cubby, sisal rope,
  pom-poms); while the kitten is up high a **sparrow** visits, the kitten pounces and misses, bird flies off.

## Decisions (don't re-litigate)

- **Electron** (JS/HTML/CSS) — transparent, frameless, always-on-top windows with per-pixel
  click-through (`setIgnoreMouseEvents(true, { forward: true })`), tray, `screen` API, login items,
  electron-builder. (Tauri, Python+Qt, Godot ruled out.)
- **Every on-screen thing is its own small window** (kitten, tree, current toy, sparrow), moved by the
  main process; not a full-screen overlay.
- Settings: plain JSON in `app.getPath('userData')` (`%APPDATA%\Desktop Cat\settings.json`).
- Window climbing: `get-windows` (ESM → `await import('get-windows')`), asarUnpacked.
- Mischief: `@nut-tree-fork/nut-js` loaded lazily in try/catch, asarUnpacked; Mac needs Accessibility.
- Packaging: electron-builder (config in `package.json` → `build`): NSIS x64 for Windows, dmg+zip
  arm64+x64 for Mac, `identity: null` (unsigned), `npmRebuild: false` (all native deps ship prebuilt
  N-API binaries). GitHub Actions `.github/workflows/release.yml` on `release: published` (+ manual
  `workflow_dispatch`), matrix windows-latest/macos-latest, `softprops/action-gh-release@v2`.
- Git for the beginner: **GitHub Desktop**.

Versions (checked 2026-10-18): electron 44.9.0 · electron-builder 26.15.3 · get-windows 9.3.0 ·
@nut-tree-fork/nut-js 4.2.6. User's machine: Node 24.22, npm 11.19.

## How it works

**Main process** `src/main/main.js` ("the legs"): bodies made with `makeBody(w, h, half)` (`win`, float
`pos`, `displayId`, drag/fall/roll timers). `overlayWindow()` gives every window the same flags
(transparent, frameless, `focusable:false`, `skipTaskbar`, always-on-top `'screen-saver'`, visible on
all workspaces). Key functions: `moveBy` (walk along `floorY` = workArea bottom − window height; walls;
crossing to a touching `neighbour()` display), `startDrag/endDrag/fall/roll` (follow cursor at 60 Hz;
gravity `GRAVITY` 2000; throw speed from the pointer trail; bounce; `ROLL_FRICTION`), props
(`createProp/removeProp/tellCat`), tree (`createTree/removeTree/perchPoint/tellTree`, `TREE` layout +
`zoom` 1.35), `leapTo(name|'roof'|'floor', atX)` (parabolic jump; sets `cat.perch`), `dropCat()`,
window climbing (`checkFrontWindow` every 2.5 s → `roof`; `startRoofWatch` 4×/s follows the window
via `openWindows()` on Windows, falls off if it closes/maximizes/minimizes), sparrow
(`birdCome/birdTick/scareBird`, phases arrive → circle → land → perched → escape), mischief
(`nudgeCursor`: needs mischief on, pointer idle ≥ 2 s; ≤ 40 px over 300 ms; aborts if the pointer
moves; reads the pointer with Electron, moves it with nut-js via `screen.dipToScreenPoint`), settings
& menu (`menuTemplate()` shared by tray and right-click; `setPaused/setHidden/setSpeed/setMischief/
setSize` — size relaunches the app), tray (`assets/icons/tray.png` + `@2x`), single-instance lock.

**Kitten page** `src/renderer/index.html`: `kitten.js` (drawing: `COL` palette, `blob`/`head`/`leg`/
`tail` helpers, rigs `sitting/side/sleeping/dangling`, `POSES[name](ctx, t, params)`, `ONE_SHOT_LEN`,
`KittenAnimator` repainting at 30 fps / 15 fps for `CALM` poses), `props.js` (bowl, fish, tub, yarn,
tree, sparrow drawings — needed for the bath poses), `sounds.js` (recordings only), `cat.js` (the
brain: state machine with `setState/next/think`; `perchNext()` while on the tree or a window; home
corner / play spot; zzz + hearts; per-pixel hit test, click vs drag; pause holds still and ticks at
10 Hz like sleep).

**Toy page** `src/renderer/prop.html` + `prop.js`: draws one thing given `{kind, scale, boxW, boxH}`
(bowl/fish/tub/yarn/**tree**/**bird** — the tree and bird use the same page), hit test, drag/throw,
click flicks the yarn or shoos the bird.

**Icons**: `npm run icons` → `tools/make-icons.js` (offscreen Electron, `tools/icons.html` draws the
kitten's head with `kitten.js`) → `assets/icons/tray.png`, `tray@2x.png`, `icon.png` (1024²).

**IPC (renderer→main)**: `set-ignore-mouse`, `log`, `move-by` (invoke), `drag-start`, `drag-end`,
`get-cursor` (invoke → `{x, y, sameDisplay, floor, idleMs}`), `show-menu`, `prop-level`, `prop-done`,
`prop-hide`, `prop-show`, `prop-kick`, `leap (name, atX)`, `bird-come`, `bird-scare`, `nudge-cursor`.
**(main→kitten)**: `config {scale, muted, sounds, speed, paused, mischief}`, `landed`, `set-muted`,
`set-paused`, `set-speed`, `set-mischief`, `prop`, `tree`, `roof`, `leaped`, `falling`, `bird`.
**(main→toy page)**: `prop-config`, `prop-level`, `prop-spin`, `prop-fade`, `prop-anim {flying, facing}`.

## Files

```
package.json                 scripts: start, icons, build, build:win, build:mac; "build" = electron-builder config;
                             "allowScripts" approves electron + get-windows install scripts (npm 11)
.gitignore                   node_modules, dist, "Claude outputs/" (Stage 1 backup zip), OS clutter
LICENSE                      MIT (placeholder name)
README.md                    what it is, screenshot, install + warnings, menu, run from source, change the look
docs/screenshot.png          README picture (rendered with the real drawing code)
docs/PUBLISHING.md           beginner walkthrough: account, GitHub Desktop, repo, commit, publish, release, updates
.github/workflows/release.yml  builds Windows + Mac installers on each published Release
src/main/main.js             main process (see "How it works")
src/main/preload.js          contextBridge "catAPI" (all IPC above)
src/main/settings.js         {size, speed, paused, mischief, muted, tree, treeX}
src/renderer/index.html      kitten page (kitten.js, props.js, sounds.js, cat.js)
src/renderer/cat.js          the brain
src/renderer/kitten.js       the kitten drawing + poses + KittenAnimator
src/renderer/props.js        toys, cat tree, sparrow drawings
src/renderer/prop.html/.js   toy/tree/sparrow window page
src/renderer/sounds.js       optional recordings (assets/sounds), silent by default
src/renderer/style.css       transparent body, grab cursors
tools/make-icons.js, tools/icons.html   icon generator
assets/icons/                tray.png, tray@2x.png, icon.png
assets/sounds/README.txt     how to add meow/purr recordings
```

## Testing approach (what worked)

Write a wrapper script in the scratchpad that `require`s `src/main/main.js`, then drives the brain
with `catWin.webContents.executeJavaScript(...)` and checks states / window bounds; run it with
`node_modules\electron\dist\electron.exe <script>` via `Start-Process` with stdout redirected. A fake
pointer: patch `screen.getCursorScreenPoint` in `app.whenReady` before requiring main. Capture menus
by wrapping `Menu.buildFromTemplate`. Window climbing: spawn a separate Electron process showing a
plain window (our own windows are ignored as roofs). Render poses / drawings in an offscreen
BrowserWindow loading kitten.js/props.js. Wrappers use `%APPDATA%\Electron\settings.json` — delete it
afterwards. Find toy windows by their `kind`, not by URL (the tree uses prop.html too).

Verified on the user's PC (all by Claude, with fake pointers / helper windows): walking & corners,
idle/sleep (≈1 % CPU awake, ≈0.4 % asleep), drag/drop/fall/dizzy, hearts, chase, play mode (bowl,
fish, bath, yarn bat/throw/roll, put away), cat tree climb, sparrow visit, tree drag knocks the kitten
off, window climb + ride along + fall when the window closes, tray menu, speed, pause, hide/show,
mischief (pointer nudged 33 px), `npm run build:win` → `dist/Desktop-Cat-Setup-0.1.0.exe` (112 MB),
packaged app starts and loads get-windows + nut-js from `app.asar.unpacked`.
**Not yet verified:** the user's own real-mouse testing of Stages 6–9; the installer actually
installing (not run — the user's call); Launch at startup (works only in the installed app); macOS
anything (no Mac here; the CI Mac build has not run yet — the x64 Mac build is made on an arm64
runner, so mischief may be unavailable on Intel Macs if nut-js lacks that binary; everything else is
fine); multi-monitor; display scaling ≠ 100 %.

## Pitfalls already hit — keep these fixes

1. **Preload can only `require('electron')` (and a few built-ins)** — renderers are sandboxed. All
   file reading lives in main and goes over IPC. Don't set `sandbox: false`.
2. PowerShell may block `npm` ("running scripts is disabled") → use `npm.cmd`, or
   `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
3. `focusable: false` is deliberate (clicking the cat never steals focus).
4. **npm 11 skips packages' install scripts unless approved** → Electron's binary wasn't downloaded
   (`node_modules\electron\dist\electron.exe` missing). Now approved in `package.json` `allowScripts`
   (`npm install-scripts approve <pkg>`); manual fix `node node_modules\electron\install.js`.
   (On GitHub's runners npm 10 runs install scripts normally.)
5. **Cat invisible on Windows**: with `focusable:false`, always-on-top level `'floating'` doesn't
   stick. Use `'screen-saver'`, applied at creation AND after every `showInactive()` (`showOnTop()`).
6. Windows created later stack above earlier ones: after showing the tree, `cat.win.moveTop()`.
7. `get-windows` bounds are physical pixels on Windows → `screen.screenToDipRect(null, b)`.
   Minimized windows sit at x ≈ −32000; maximized ones have no room above (ignored).
8. **nut-js `mouse.getPosition()` returns a stale position right after `setPosition`** → read the
   pointer with Electron's `screen.getCursorScreenPoint()` and only *move* it with nut-js.
9. VS Code must be fully restarted after installing Node, or its terminal can't find `npm`.
10. PowerShell 5.1 `ConvertFrom-Json` on an array: unroll with `ForEach-Object { $_ }`.

## Commands

```
npm install          # once (downloads Electron and the native helpers)
npm start            # run from source (quit: tray/right-click → Quit, or Ctrl+C)
npm run icons        # redraw assets/icons after changing the kitten's look
npm run build:win    # Windows installer → dist/Desktop-Cat-Setup-<version>.exe
npm run build:mac    # Mac .dmg/.zip (must run on a Mac; normally GitHub Actions does it)
```
