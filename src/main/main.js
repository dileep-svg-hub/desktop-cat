/*
  src/main/main.js  —  the "main process"
  ----------------------------------------
  Electron apps have two halves:
    * MAIN (this file, Node.js): talks to the operating system — creates
      windows, reads screen sizes, later the tray icon and settings file.
    * RENDERER (src/renderer/*): ordinary web pages that draw things.
  They talk to each other through "IPC" messages (ipcMain / ipcRenderer).

  Think of it as: renderer = the cat's BRAIN (decides what to do),
                  main     = the cat's LEGS  (actually moves the windows).

  Every thing on your desktop — the kitten, and the play things (food bowl,
  fish snack, bathtub, yarn ball) — is its own small transparent window that
  floats above everything. Clicks pass through except on the thing itself.
  Main moves these windows: walking along the "floor" (the top of the
  taskbar/dock), following your mouse while you drag them, falling with
  gravity when dropped, and (the yarn) rolling and bouncing when thrown.

  Stage 1: transparent always-on-top window, per-pixel click-through.
  Stage 2: walking along the floor, walls, neighbouring monitors.
  Stage 4: drag & drop with gravity; tells the brain where the pointer is.
  Stage 5: right-click menu; optional sounds; settings file.
  Stage 6: play mode — food bowl, fish snack, bath time, yarn ball; cat tree + sparrow.
  Stage 7: climbing onto the window you're using (get-windows).
  Stage 8: tray icon + settings (size, speed, pause, hide, launch at startup).
  Stage 9: optional mischief mode (nudges the pointer; nut-js).
*/

const { app, BrowserWindow, screen, ipcMain, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const settings = require('./settings');

// Only one Desktop Cat at a time: starting it again just shows the running one.
if (!app.requestSingleInstanceLock()) app.quit();

settings.load();        // read your saved choices first: the cat's size depends on them
const SIZES = { small: 1.5, medium: 2, large: 2.6 };          // pixels per drawing unit
const SPEEDS = { slow: 0.6, normal: 1, fast: 1.6 };           // walking speed multiplier
const SCALE = SIZES[settings.get('size')] || 2;               // 2 = "medium" cat (about 120 px tall)
const GRAVITY = 2000;   // how fast a dropped thing speeds up, in pixels per second per second
const ROLL_FRICTION = 1.6;   // how quickly a rolling yarn ball slows down
const BOUNCE = 0.6;     // how much speed a ball keeps when it bounces off the screen edge

const assetsDir = path.join(__dirname, '..', '..', 'assets');
const CELL = 64;                // things are drawn in a 64x64 box (see src/renderer/kitten.js)
const CAT_PX = CELL * SCALE;    // the cat's on-screen size
// The cat's window is twice the cat's size so there is room for hearts / zzz.
const W = CAT_PX * 2;
const H = CAT_PX * 2;
const PROP_PX = CAT_PX;         // a play thing's window: one 64x64 box
// Half the visible width of each play thing (keeps it on screen), in box units.
const PROP_HALF = { bowl: 13, fish: 11, tub: 21, yarn: 8 };
const YARN_RADIUS_PX = 7 * SCALE;

// The cat tree: drawn in a 100 x 160 box (floor at y = 156), shown `zoom` times
// bigger than the kitten's units. Perches = where the kitten's feet go on each
// platform, in box units (props.js draws the platforms at the same spots).
const TREE = {
  w: 100, h: 160, zoom: 1.35,
  perches: { dish: { x: 80, y: 126 }, bowl: { x: 56, y: 95 }, left: { x: 22, y: 64 }, top: { x: 52, y: 34 } },
};
const TREE_S = SCALE * TREE.zoom;               // screen pixels per tree unit
const TREE_W = Math.round(TREE.w * TREE_S);
const TREE_H = Math.round(TREE.h * TREE_S);
const BIRD_BOX = 32;                            // the sparrow's drawing box (feet at y = 28)
const BIRD_PX = BIRD_BOX * SCALE;

// Optional sounds: put meow.wav / purr.wav (or .mp3 / .ogg) in assets/sounds and
// the cat will use them. Without them it stays silent. They're sent to the page
// as base64 text, because the page isn't allowed to read files itself.
function loadSoundOverride(name) {
  for (const ext of ['wav', 'mp3', 'ogg']) {
    const file = path.join(assetsDir, 'sounds', `${name}.${ext}`);
    if (fs.existsSync(file)) return fs.readFileSync(file).toString('base64');
  }
  return null;
}
const soundOverrides = { meow: loadSoundOverride('meow'), purr: loadSoundOverride('purr') };

// --- "bodies": anything main moves around ------------------------------------
// pos is kept as decimals (e.g. x = 512.37) so slow movement is smooth; the OS
// only gets whole pixels.
function makeBody(w, h, half) {
  return {
    win: null, w, h, half,          // window size, and half the visible thing's width
    pos: { x: 0, y: 0 },
    displayId: null,                // which monitor it's on
    dragTimer: null, fallTimer: null, rollTimer: null,
    grab: { x: 0, y: 0 },           // where inside the window you grabbed it
    trail: [],                      // recent pointer positions while dragging (to measure a throw)
    onLanded: () => {},
  };
}

const cat = makeBody(W, H, CAT_PX / 2);
cat.perch = null;                   // name of the tree platform the cat is sitting on, or null
let prop = null;                    // { body, kind, level, angle, hidden } — the current play thing
let tree = null;                    // the cat tree's body (or null when it's switched off)
let bird = null;                    // { body, phase, start, from, to, … } — a visiting sparrow
let paused = settings.get('paused');   // "Pause": the cat holds still
let hidden = false;                 // "Hide cat": everything is hidden (always shown again at launch)
let tray = null;                    // the icon by the clock (Windows) / in the menu bar (Mac)

const busy = (b) => Boolean(b.dragTimer || b.fallTimer);

// --- screen helpers ---------------------------------------------------------

// "workArea" = the screen minus the taskbar (Windows) or dock/menu bar (Mac).
// The floor is its bottom edge; a window's bottom sits on it.
function floorY(display, body) {
  const wa = display.workArea;
  return wa.y + wa.height - body.h;
}

function currentDisplay(body) {
  return screen.getAllDisplays().find((d) => d.id === body.displayId)
    || screen.getDisplayNearestPoint({ x: Math.round(body.pos.x + body.w / 2), y: Math.round(body.pos.y + body.h / 2) });
}

// Is there another monitor directly to the right (or left) of this one,
// touching it, so the cat can walk across?
function neighbour(display, toRight) {
  const b = display.bounds;
  return screen.getAllDisplays().find((o) => {
    if (o.id === display.id) return false;
    const ob = o.bounds;
    const touches = toRight
      ? Math.abs(ob.x - (b.x + b.width)) <= 1
      : Math.abs((ob.x + ob.width) - b.x) <= 1;
    const overlapsVertically = ob.y < b.y + b.height && ob.y + ob.height > b.y;
    return touches && overlapsVertically;
  });
}

function applyPosition(body) {
  if (!body.win || body.win.isDestroyed()) return;
  // setBounds (not setPosition) also re-states the size, which stops Windows
  // from resizing the window when it crosses onto a monitor with different scaling.
  body.win.setBounds({ x: Math.round(body.pos.x), y: Math.round(body.pos.y), width: body.w, height: body.h });
}

// Where a body is: its centre (cx) and the left/right edges of its screen.
function where(body) {
  const wa = currentDisplay(body).workArea;
  return { cx: body.pos.x + body.w / 2, left: wa.x, right: wa.x + wa.width };
}

// Move the cat sideways by dx pixels along the floor.
// Returns { edge: 'left' | 'right' | null, cx, left, right } so the brain knows
// to turn around, where the cat is and where this screen's edges are (to find the corners).
function moveBy(dx) {
  if (busy(cat) || cat.perch) return { edge: null, ...where(cat) };   // carried / falling / up the tree
  let d = currentDisplay(cat);
  let cx = cat.pos.x + W / 2 + dx;         // where the cat's centre would go
  let edge = null;

  // Walked past the side of this monitor onto a neighbouring one?
  const b = d.bounds;
  if (cx >= b.x + b.width || cx < b.x) {
    const next = neighbour(d, cx >= b.x + b.width);
    if (next) { d = next; cat.displayId = next.id; }
  }

  // Walls: the cat's body must stay on screen unless a monitor continues on that side.
  const wa = d.workArea;
  const minCx = neighbour(d, false) ? -Infinity : wa.x + cat.half;
  const maxCx = neighbour(d, true) ? Infinity : wa.x + wa.width - cat.half;
  if (cx < minCx) { cx = minCx; edge = 'left'; }
  if (cx > maxCx) { cx = maxCx; edge = 'right'; }

  cat.pos.x = cx - W / 2;
  cat.pos.y = floorY(d, cat);              // stay standing on this monitor's floor
  applyPosition(cat);
  return { edge, ...where(cat) };
}

// Put things back on a floor if monitors are plugged/unplugged or the taskbar moves.
function resnap() {
  for (const body of [tree, cat, prop && prop.body]) {
    if (!body || busy(body)) continue;
    if (body === cat && cat.perch && tree) { placeOnPerch(cat.perch); continue; }
    body.displayId = null;
    const d = currentDisplay(body);
    body.displayId = d.id;
    body.pos.y = floorY(d, body);
    applyPosition(body);
  }
}

function stopTimers(body) {
  clearInterval(body.dragTimer); body.dragTimer = null;
  clearInterval(body.fallTimer); body.fallTimer = null;
  clearInterval(body.rollTimer); body.rollTimer = null;
}

// --- carrying, dropping, throwing, rolling ---------------------------------------

// You grabbed something at (offX, offY) inside its window. From now on, keep
// that spot under the mouse pointer.
function startDrag(body, offX, offY) {
  stopTimers(body);
  body.grab.x = offX;
  body.grab.y = offY;
  body.trail = [];
  // While carried, the whole window takes the mouse, so letting go anywhere
  // near it is noticed even if the pointer slips off.
  body.win.setIgnoreMouseEvents(false);
  body.dragTimer = setInterval(() => {
    const c = screen.getCursorScreenPoint();
    body.pos.x = c.x - body.grab.x;
    body.pos.y = c.y - body.grab.y;
    applyPosition(body);
    body.trail.push({ x: c.x, t: Date.now() });
    if (body.trail.length > 8) body.trail.shift();
  }, 16);                                  // ~60 times a second
}

// How fast the pointer was moving sideways just before you let go (pixels/second).
function throwSpeed(body) {
  const now = Date.now();
  const recent = body.trail.filter((p) => now - p.t < 120);
  if (recent.length < 2) return 0;
  const a = recent[0], b = recent[recent.length - 1];
  const v = (b.x - a.x) / Math.max(0.016, (b.t - a.t) / 1000);
  return Math.max(-1600, Math.min(1600, v));
}

// Keep a body's centre on its screen (cx = centre). Returns the clamped value and which wall it hit.
function clampToScreen(body, d, cx) {
  const wa = d.workArea;
  if (cx < wa.x + body.half) return { cx: wa.x + body.half, wall: -1 };
  if (cx > wa.x + wa.width - body.half) return { cx: wa.x + wa.width - body.half, wall: 1 };
  return { cx, wall: 0 };
}

// You let go. Find the screen underneath and fall down to its floor.
// Things that can roll (the yarn) keep the sideways speed of your throw.
function endDrag(body, canRoll = false) {
  if (!body.dragTimer) return;
  clearInterval(body.dragTimer);
  body.dragTimer = null;
  let vx = canRoll ? throwSpeed(body) : 0;

  fall(body, vx);
}

// Fall from wherever the body is now down to the floor of the screen underneath.
function fall(body, vx = 0) {
  const d = screen.getDisplayNearestPoint({ x: Math.round(body.pos.x + body.w / 2), y: Math.round(body.pos.y + body.h) });
  body.displayId = d.id;
  body.pos.x = clampToScreen(body, d, body.pos.x + body.w / 2).cx - body.w / 2;
  body.pos.y = Math.max(body.pos.y, d.workArea.y - body.h / 2);   // not above the top of the screen

  const floor = floorY(d, body);
  if (body.pos.y >= floor) {               // dropped on (or below) the floor: just stand there
    body.pos.y = floor;
    applyPosition(body);
    body.onLanded(0, vx);
    return;
  }

  const startY = body.pos.y;
  let vy = 0;
  let last = Date.now();
  body.fallTimer = setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    vy += GRAVITY * dt;                    // gravity: fall faster and faster
    body.pos.y += vy * dt;
    if (vx) {                              // thrown: keep flying sideways, bounce off the walls
      const c = clampToScreen(body, d, body.pos.x + body.w / 2 + vx * dt);
      if (c.wall) vx = -vx * BOUNCE;
      body.pos.x = c.cx - body.w / 2;
    }
    if (body.pos.y >= floor) {
      body.pos.y = floor;
      clearInterval(body.fallTimer);
      body.fallTimer = null;
      applyPosition(body);
      body.onLanded(floor - startY, vx);
    } else {
      applyPosition(body);
    }
  }, 16);
}

// Roll along the floor with speed vx (pixels/second), slowing down, bouncing off walls.
function roll(body, vx, onMove, onStop) {
  clearInterval(body.rollTimer);
  const d = currentDisplay(body);
  let last = Date.now();
  let lastReport = 0;
  body.rollTimer = setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const c = clampToScreen(body, d, body.pos.x + body.w / 2 + vx * dt);
    if (c.wall) vx = -vx * BOUNCE;
    const moved = c.cx - (body.pos.x + body.w / 2);
    body.pos.x = c.cx - body.w / 2;
    applyPosition(body);
    vx *= Math.exp(-ROLL_FRICTION * dt);
    onMove(moved);
    if (now - lastReport > 60) { lastReport = now; onStop(false); }   // keep the cat updated
    if (Math.abs(vx) < 12) {
      clearInterval(body.rollTimer);
      body.rollTimer = null;
      onStop(true);
    }
  }, 16);
}

// --- windows -----------------------------------------------------------------

// A transparent, frameless, always-on-top window that never takes focus.
function overlayWindow(width, height, x, y) {
  const win = new BrowserWindow({
    width, height, x: Math.round(x), y: Math.round(y),
    transparent: true,      // see-through background
    frame: false,           // no title bar or borders
    alwaysOnTop: true,      // floats above other apps
    resizable: false,
    movable: false,         // the user can't drag the window itself; we move it in code
    skipTaskbar: true,      // no taskbar button
    hasShadow: false,       // (Mac) no drop shadow around the invisible window
    focusable: false,       // clicking never steals focus from your work
    show: false,            // show once the page has loaded (avoids a white flash)
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,  // keep animating even though we're never "focused"
      // Web pages normally may not make sounds until you click them. The cat
      // should be able to meow on its own, so we lift that rule.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  // Start fully click-through. `forward: true` still lets the page see mouse
  // movement, so it can tell us when the pointer is over the drawing.
  win.setIgnoreMouseEvents(true, { forward: true });
  // 'screen-saver' is the highest "always on top" level. On Windows the lower
  // 'floating' level doesn't stick to a window that can't take focus.
  win.setAlwaysOnTop(true, 'screen-saver');
  // On Mac this keeps it on every desktop ("Space") and above full-screen apps.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  return win;
}

function showOnTop(win) {
  win.showInactive();                         // show without taking focus
  win.setAlwaysOnTop(true, 'screen-saver');   // apply again once visible (Windows can drop it on show)
}

function createCatWindow() {
  const d = screen.getPrimaryDisplay();
  const wa = d.workArea;
  cat.displayId = d.id;
  cat.pos.x = Math.round(wa.x + wa.width - CAT_PX / 2 - W / 2 - 40);   // start in the bottom-right corner
  cat.pos.y = floorY(d, cat);

  cat.win = overlayWindow(W, H, cat.pos.x, cat.pos.y);
  cat.win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  cat.win.webContents.on('did-finish-load', () => {
    cat.win.webContents.send('config', {
      scale: SCALE, muted: settings.get('muted'), sounds: soundOverrides,
      speed: SPEEDS[settings.get('speed')] || 1, paused: paused || hidden, mischief: settings.get('mischief'),
    });
    showOnTop(cat.win);
  });
  cat.win.on('closed', () => { stopTimers(cat); cat.win = null; });
  cat.onLanded = (height) => {
    if (cat.win) cat.win.webContents.send('landed', { height, ...where(cat) });
  };
}

// --- play things ---------------------------------------------------------------

// Tell the cat's brain about the current play thing (or that there is none).
// reason: 'new' | 'moved' (you dragged/threw it) | 'rolling' | 'stopped' | 'level'
function tellCat(reason) {
  if (!cat.win) return;
  cat.win.webContents.send('prop', prop ? {
    kind: prop.kind,
    cx: prop.body.pos.x + PROP_PX / 2,
    level: prop.level,
    moving: Boolean(prop.body.dragTimer || prop.body.fallTimer || prop.body.rollTimer),
    reason,
  } : null);
}

function sendToProp(channel, value) {
  if (prop && prop.body.win && !prop.body.win.isDestroyed()) prop.body.win.webContents.send(channel, value);
}

// Put a new play thing on the floor, a little way from the cat (towards the
// middle of the screen) so you can watch the cat go to it.
function createProp(kind) {
  removeProp(false);
  const d = currentDisplay(cat);
  const wa = d.workArea;
  const catCx = cat.pos.x + W / 2;
  const towardsMiddle = wa.x + wa.width / 2 > catCx ? 1 : -1;
  const body = makeBody(PROP_PX, PROP_PX, PROP_HALF[kind] * SCALE);
  body.displayId = d.id;
  const cx = clampToScreen(body, d, catCx + towardsMiddle * 320).cx;
  body.pos.x = cx - PROP_PX / 2;
  body.pos.y = floorY(d, body);

  body.win = overlayWindow(PROP_PX, PROP_PX, body.pos.x, body.pos.y);
  body.win.loadFile(path.join(__dirname, '..', 'renderer', 'prop.html'));
  body.win.webContents.on('did-finish-load', () => {
    body.win.webContents.send('prop-config', { kind, scale: SCALE, level: 1 });
    showOnTop(body.win);
  });
  const thisProp = { body, kind, level: 1, angle: 0, hidden: false };
  body.win.on('closed', () => { stopTimers(body); body.win = null; });

  // Dropped after you dragged it: thrown yarn keeps rolling; everything else just lands.
  body.onLanded = (_height, vx) => {
    if (kind === 'yarn' && Math.abs(vx) > 60) rollYarn(vx);
    else tellCat('moved');
  };
  prop = thisProp;
  tellCat('new');
}

function rollYarn(vx) {
  if (!prop || prop.kind !== 'yarn') return;
  const p = prop;
  roll(p.body, vx,
    (moved) => { p.angle += moved / YARN_RADIUS_PX; sendToProp('prop-spin', p.angle); },
    (stopped) => tellCat(stopped ? 'stopped' : 'rolling'));
}

// Take the play thing away (fade = gently fade it out first).
function removeProp(fade) {
  if (!prop) return;
  const old = prop;
  prop = null;
  stopTimers(old.body);
  if (old.body.win && !old.body.win.isDestroyed()) {
    if (fade) {
      old.body.win.webContents.send('prop-fade');
      setTimeout(() => { if (old.body.win && !old.body.win.isDestroyed()) old.body.win.close(); }, 600);
    } else {
      old.body.win.close();
    }
  }
  tellCat('gone');
}

// --- the cat tree ----------------------------------------------------------------

// Where the cat's feet go on a platform (screen pixels).
function perchPoint(name) {
  const p = TREE.perches[name];
  return { x: tree.pos.x + p.x * TREE_S, y: tree.pos.y + (p.y + 4) * TREE_S };
}

function placeOnPerch(name) {
  const p = perchPoint(name);
  cat.pos.x = p.x - W / 2;
  cat.pos.y = p.y - H;
  applyPosition(cat);
}

// Tell the cat's brain where the tree and its platforms are (or that there's no tree).
function tellTree() {
  if (!cat.win) return;
  const perches = {};
  if (tree) for (const name of Object.keys(TREE.perches)) perches[name] = perchPoint(name);
  cat.win.webContents.send('tree', tree ? { left: tree.pos.x, right: tree.pos.x + TREE_W, perches } : null);
}

function createTree() {
  if (tree) return;
  const d = screen.getPrimaryDisplay();
  const wa = d.workArea;
  const body = makeBody(TREE_W, TREE_H, TREE_W / 2 - 6 * TREE_S);
  body.displayId = d.id;
  const saved = settings.get('treeX');
  const x = typeof saved === 'number' ? saved : wa.x + 12;          // bottom-left corner unless you moved it
  body.pos.x = clampToScreen(body, d, x + TREE_W / 2).cx - TREE_W / 2;
  body.pos.y = floorY(d, body);
  body.win = overlayWindow(TREE_W, TREE_H, body.pos.x, body.pos.y);
  body.win.loadFile(path.join(__dirname, '..', 'renderer', 'prop.html'));
  body.win.webContents.on('did-finish-load', () => {
    body.win.webContents.send('prop-config', { kind: 'tree', scale: TREE_S, boxW: TREE.w, boxH: TREE.h });
    showOnTop(body.win);
    if (cat.win) cat.win.moveTop();                                   // the kitten goes in front of the tree
    if (prop && prop.body.win) prop.body.win.moveTop();
  });
  body.win.on('closed', () => { stopTimers(body); body.win = null; });
  body.onLanded = () => { settings.set('treeX', Math.round(body.pos.x)); tellTree(); };
  tree = body;
  tellTree();
}

function removeTree() {
  if (!tree) return;
  if (cat.perch) dropCat();
  stopTimers(tree);
  if (tree.win && !tree.win.isDestroyed()) tree.win.close();
  tree = null;
  tellTree();
}

// The tree (or window) moved or vanished under the cat: it falls off.
function dropCat() {
  cat.perch = null;
  stopRoofWatch();
  scareBird();
  stopTimers(cat);
  if (cat.win) cat.win.webContents.send('falling');
  fall(cat);
}

// Jump along an arc to a tree platform, onto the top of a window ('roof', at
// screen x = atX), or ('floor') down to the floor.
function leapTo(name, atX) {
  if (!cat.win || busy(cat)) return;
  if (name === 'roof' ? !roof : name !== 'floor' && !tree) return;
  scareBird();
  stopRoofWatch();
  const from = { x: cat.pos.x + W / 2, y: cat.pos.y + H };          // feet
  let to;
  if (name === 'floor') {
    const d = currentDisplay(cat);
    let away;
    if (cat.perch === 'roof' || !tree) away = 0.5;                  // off a window: hop down just beside it
    else away = from.x >= tree.pos.x + TREE_W / 2 ? 1 : -1;          // land on the outside of the tree
    const cx = clampToScreen(cat, d, from.x + away * 70).cx;
    to = { x: cx, y: floorY(d, cat) + H };
  } else if (name === 'roof') {
    const x = Math.min(Math.max(Number(atX) || from.x, roof.left + 45), roof.right - 45);
    to = { x, y: roof.top };
    cat.roof = { id: roof.id, offset: x - roof.x };                  // where on the window it sits
  } else {
    to = perchPoint(name);
  }
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const dur = 0.45 + Math.min(0.35, dist / 1600);
  const apex = Math.min(from.y, to.y) - 45 - Math.min(60, dist * 0.1);   // highest point of the jump
  const ctrlY = 2 * apex - (from.y + to.y) / 2;
  const start = Date.now();
  cat.perch = null;
  cat.fallTimer = setInterval(() => {                                // (counts as "busy", like falling)
    const k = Math.min(1, (Date.now() - start) / 1000 / dur);
    const x = from.x + (to.x - from.x) * k;
    const y = (1 - k) * (1 - k) * from.y + 2 * (1 - k) * k * ctrlY + k * k * to.y;
    cat.pos.x = x - W / 2;
    cat.pos.y = y - H;
    applyPosition(cat);
    if (k >= 1) {
      clearInterval(cat.fallTimer);
      cat.fallTimer = null;
      cat.perch = name === 'floor' ? null : name;
      cat.displayId = screen.getDisplayNearestPoint({ x: Math.round(to.x), y: Math.round(to.y - 10) }).id;
      if (name === 'roof') startRoofWatch();
      if (cat.win) cat.win.webContents.send('leaped', { perch: cat.perch, height: Math.max(0, to.y - from.y), ...where(cat) });
    }
  }, 16);
}

// --- climbing onto windows (Stage 7) ----------------------------------------------
// get-windows tells us where the window you're working in (the "active" one)
// is. If it isn't maximized and there's room above it, the kitten may jump up
// and sit on its top edge. While it's up there we keep checking that window:
// move it and the kitten rides along; maximize, minimize or close it and the
// kitten falls off. get-windows is an "ES module", so it's loaded with import().

let roof = null;                    // the window the kitten could climb: { id, x, left, right, top }
let roofTimer = null;               // checks the window the kitten is sitting on
let getWindows = null;

async function windowsApi() {
  if (!getWindows) getWindows = await import('get-windows');
  return getWindows;
}

// Window bounds come from the OS in real pixels; Electron works in "DIP"
// (pixels before display scaling), so on Windows we convert.
function toDip(b) {
  return process.platform === 'win32' ? screen.screenToDipRect(null, b) : b;
}

// A window the kitten could sit on, or null.
function asRoof(w) {
  if (!w || !w.bounds || (w.owner && w.owner.processId === process.pid)) return null;
  const b = toDip(w.bounds);
  const d = screen.getDisplayNearestPoint({ x: Math.round(b.x + b.width / 2), y: Math.round(b.y + 10) });
  const wa = d.workArea;
  const left = Math.max(b.x + 8, wa.x), right = Math.min(b.x + b.width - 8, wa.x + wa.width);   // (ignore the invisible resize borders)
  const roomAbove = b.y - wa.y >= 140;                               // the kitten must fit above it
  const highEnough = wa.y + wa.height - b.y >= 160;                  // worth jumping up to
  if (!roomAbove || !highEnough || right - left < 260 || b.x < -10000) return null;   // (minimized windows sit at -32000)
  return { id: w.id, x: b.x, left, right, top: b.y };
}

async function checkFrontWindow() {
  if (!cat.win || cat.perch === 'roof' || paused || hidden) return;
  let found = null;
  try {
    const api = await windowsApi();
    found = asRoof(await api.activeWindow({ screenRecordingPermission: false, accessibilityPermission: false }));
  } catch { found = null; }                                          // (no permission / not supported: just no climbing)
  const key = (r) => (r ? `${r.id}:${Math.round(r.left)}:${Math.round(r.right)}:${Math.round(r.top)}` : '');
  if (key(found) !== key(roof)) {
    roof = found;
    if (cat.win) cat.win.webContents.send('roof', roof && { left: roof.left, right: roof.right, top: roof.top });
  }
}

// While sitting on a window, follow it (or fall off).
function startRoofWatch() {
  stopRoofWatch();
  let checking = false;
  roofTimer = setInterval(async () => {
    if (checking || !cat.roof || cat.perch !== 'roof') return;
    checking = true;
    try {
      const api = await windowsApi();
      let w = null;
      if (process.platform === 'win32') {
        w = (await api.openWindows()).find((o) => o.id === cat.roof.id);   // track it even when it's not in front
      } else {
        const a = await api.activeWindow({ screenRecordingPermission: false, accessibilityPermission: false });
        if (a && a.id === cat.roof.id) w = a;
        else if (a) { checking = false; return; }                     // (Mac: can't see it while another window is in front; stay put)
      }
      const r = asRoof(w);
      if (!r || cat.perch !== 'roof') { if (cat.perch === 'roof') dropCat(); checking = false; return; }
      const x = r.x + cat.roof.offset;
      if (Math.abs(x - (cat.pos.x + W / 2)) > 0.5 || Math.abs(r.top - (cat.pos.y + H)) > 0.5) {
        cat.pos.x = Math.min(Math.max(x, r.left + 20), r.right - 20) - W / 2;   // ride along with the window
        cat.pos.y = r.top - H;
        applyPosition(cat);
      }
    } catch { /* ignore one failed check */ }
    checking = false;
  }, 250);
}

function stopRoofWatch() {
  clearInterval(roofTimer);
  roofTimer = null;
}

// --- the sparrow -----------------------------------------------------------------
// It flies in from the side of the screen, circles the kitten's head, lands
// on the platform beside it, hops about… and flies away when the kitten
// pounces (or when you click it). Main moves the bird; the bird's page just
// flaps or hops; the cat's brain gets told where the bird is.

const lerp = (a, b, k) => a + (b - a) * k;
const easeInOut = (k) => k * k * (3 - 2 * k);

function birdPhase(phase, from, to, dur) {
  Object.assign(bird, { phase, from, to, dur, start: Date.now() });
  const flying = phase !== 'perched';
  if (bird.body.win) bird.body.win.webContents.send('prop-anim', { flying, facing: bird.facing });
}

function catHead() {
  return { x: cat.pos.x + W / 2, y: cat.pos.y + H - 72 };
}

function birdCome() {
  if (bird || !cat.perch || !cat.win || paused || hidden) return;
  const d = currentDisplay(cat);
  const wa = d.workArea;
  const head = catHead();
  const fromLeft = head.x > wa.x + wa.width / 2;                     // come in from the far side, so it crosses the screen
  const body = makeBody(BIRD_PX, BIRD_PX, BIRD_PX / 2);
  const start = { x: fromLeft ? wa.x - 40 : wa.x + wa.width + 40, y: Math.max(wa.y + 40, head.y - 260) };
  body.pos = { x: start.x - BIRD_PX / 2, y: start.y - BIRD_PX };
  body.win = overlayWindow(BIRD_PX, BIRD_PX, body.pos.x, body.pos.y);
  body.win.loadFile(path.join(__dirname, '..', 'renderer', 'prop.html'));
  body.win.webContents.on('did-finish-load', () => {
    body.win.webContents.send('prop-config', { kind: 'bird', scale: SCALE, boxW: BIRD_BOX, boxH: BIRD_BOX });
    body.win.webContents.send('prop-anim', { flying: true, facing: bird ? bird.facing : 1 });
    showOnTop(body.win);
  });
  body.win.on('closed', () => { body.win = null; });
  bird = { body, facing: fromLeft ? 1 : -1, side: fromLeft ? -1 : 1, pt: { ...start }, lastTell: 0 };
  const circleStart = { x: head.x + bird.side * 80, y: head.y - 50 };
  birdPhase('arrive', start, circleStart, 2.2);
  bird.timer = setInterval(birdTick, 16);
}

function birdTick() {
  if (!bird) return;
  const now = Date.now();
  const k = Math.min(1, (now - bird.start) / 1000 / bird.dur);
  const head = catHead();
  let x, y;
  if (bird.phase === 'arrive') {                                      // swoop in, bobbing up and down
    x = lerp(bird.from.x, bird.to.x, easeInOut(k));
    y = lerp(bird.from.y, bird.to.y, easeInOut(k)) + Math.sin(k * Math.PI * 4) * 18;
    if (k >= 1) birdPhase('circle', bird.to, null, 3.6);
  } else if (bird.phase === 'circle') {                               // flutter round the kitten's head
    const a = (bird.side > 0 ? 0 : Math.PI) + k * Math.PI * 2.5 * bird.side;
    x = head.x + Math.cos(a) * 80;
    y = head.y - 50 + Math.sin(a) * 30 + Math.sin(now / 90) * 3;
    if (k >= 1) {
      const land = { x: head.x + (x > head.x ? 1 : -1) * 40, y: cat.pos.y + H };   // on the platform, next to the kitten
      birdPhase('land', { x, y }, land, 0.8);
    }
  } else if (bird.phase === 'land') {
    x = lerp(bird.from.x, bird.to.x, easeInOut(k));
    y = lerp(bird.from.y, bird.to.y, easeInOut(k)) - Math.sin(k * Math.PI) * 15;
    if (k >= 1) {
      bird.facing = bird.to.x > head.x ? -1 : 1;                      // look at the kitten
      birdPhase('perched', bird.to, null, 7);
    }
  } else if (bird.phase === 'perched') {
    x = bird.from.x; y = bird.from.y;
    if (k >= 1) scareBird();                                          // got bored, flies off
  } else {                                                            // escape: up and away!
    x = lerp(bird.from.x, bird.to.x, k * k);
    y = lerp(bird.from.y, bird.to.y, k) + Math.sin(k * Math.PI * 5) * 10;
    if (k >= 1) { removeBird(); return; }
  }
  const dx = x - bird.pt.x;
  if (bird.phase !== 'perched' && Math.abs(dx) > 0.5) {
    const f = dx > 0 ? 1 : -1;
    if (f !== bird.facing) { bird.facing = f; bird.body.win && bird.body.win.webContents.send('prop-anim', { flying: true, facing: f }); }
  }
  bird.pt = { x, y };
  bird.body.pos = { x: x - BIRD_PX / 2, y: y - BIRD_PX };
  applyPosition(bird.body);
  if (now - bird.lastTell > 100 && cat.win) {
    bird.lastTell = now;
    cat.win.webContents.send('bird', { phase: bird.phase, x, y, catX: head.x });
  }
}

// Off it goes (the kitten pounced, you clicked it, or the kitten left).
function scareBird() {
  if (!bird || bird.phase === 'escape') return;
  const d = currentDisplay(cat);
  const wa = d.workArea;
  const away = bird.pt.x >= catHead().x ? 1 : -1;
  bird.facing = away;
  birdPhase('escape', { ...bird.pt }, { x: away > 0 ? wa.x + wa.width + 80 : wa.x - 80, y: wa.y - 60 }, 1.8);
  if (cat.win) cat.win.webContents.send('bird', { phase: 'escape', x: bird.pt.x, y: bird.pt.y, catX: catHead().x });
}

function removeBird() {
  if (!bird) return;
  clearInterval(bird.timer);
  if (bird.body.win && !bird.body.win.isDestroyed()) bird.body.win.close();
  bird = null;
  if (cat.win) cat.win.webContents.send('bird', null);
}

// --- messages from the pages ---

// Which thing sent this message: the cat, the play thing, the tree or the sparrow?
function bodyFor(event) {
  for (const body of [cat, prop && prop.body, tree, bird && bird.body]) {
    if (body && body.win && !body.win.isDestroyed() && event.sender === body.win.webContents) return body;
  }
  return null;
}

ipcMain.on('set-ignore-mouse', (event, ignore) => {
  const body = bodyFor(event);
  if (body && body.win && !body.dragTimer) body.win.setIgnoreMouseEvents(ignore, { forward: true });
});
ipcMain.on('log', (_event, ...args) => console.log('[cat]', ...args));
// "invoke/handle" is a message that gets an answer back.
ipcMain.handle('move-by', (_event, dx) => moveBy(Number(dx) || 0));
ipcMain.on('drag-start', (event, offX, offY) => {
  const body = bodyFor(event);
  if (!body || !body.win || (bird && body === bird.body)) return;
  if (body === cat) { cat.perch = null; stopRoofWatch(); scareBird(); }   // picked up off the tree / a window
  if (body === tree && cat.perch) dropCat();                        // moving the tree knocks the kitten off!
  startDrag(body, Number(offX) || 0, Number(offY) || 0);
  if (prop && body === prop.body) tellCat('moved');
});
ipcMain.on('drag-end', (event) => {
  const body = bodyFor(event);
  if (body) endDrag(body, prop && body === prop.body && prop.kind === 'yarn');
});
// Where is the mouse pointer? (screen pixels) Plus: is it on the cat's screen,
// and where is that screen's floor, so the cat can decide whether to chase it.
ipcMain.handle('get-cursor', () => {
  const c = trackCursor();
  const d = currentDisplay(cat);
  return {
    x: c.x, y: c.y, sameDisplay: screen.getDisplayNearestPoint(c).id === d.id, floor: floorY(d, cat) + H,
    idleMs: Date.now() - lastCursorMove,                            // how long the pointer has been still
  };
});

// From the cat's brain, about the play thing:
ipcMain.on('prop-level', (_event, level) => {        // food left in the bowl / fish left
  if (!prop) return;
  prop.level = Math.max(0, Math.min(1, Number(level) || 0));
  sendToProp('prop-level', prop.level);
});
ipcMain.on('prop-done', () => removeProp(true));      // all eaten / bath over
ipcMain.on('prop-hide', () => {                       // the cat hopped into the tub (it draws the tub itself)
  if (prop && prop.body.win) { prop.hidden = true; prop.body.win.hide(); }
});
ipcMain.on('prop-show', () => {
  if (prop && prop.body.win && prop.hidden) { prop.hidden = false; showOnTop(prop.body.win); }
});
ipcMain.on('prop-kick', (_event, vx) => {             // the cat (or you, with a click) batted the yarn
  if (prop && prop.kind === 'yarn' && !busy(prop.body)) rollYarn(Number(vx) || 0);
});
// The tree and the sparrow:
ipcMain.on('leap', (_event, name, atX) => leapTo(String(name), atX));   // jump to a platform, a window ('roof') or 'floor'
ipcMain.on('bird-come', () => birdCome());
ipcMain.on('bird-scare', () => scareBird());

// --- mischief mode (Stage 9) -------------------------------------------------------
// OFF unless you turn it on. When the pointer has been resting for 2 seconds
// right next to the kitten, it may bat at it and nudge it up to 40 pixels
// sideways. It never clicks or types, and it stops the instant you move the
// mouse yourself. Moving the pointer needs the nut-js library (and on a Mac,
// Accessibility permission); if that isn't available, mischief mode just does nothing.

let nut = null;
let nutFailed = false;
let nudging = false;
let lastCursor = { x: 0, y: 0 };
let lastCursorMove = Date.now();

function trackCursor() {
  const c = screen.getCursorScreenPoint();
  if (c.x !== lastCursor.x || c.y !== lastCursor.y) { lastCursor = c; lastCursorMove = Date.now(); }
  return c;
}

async function nutApi() {
  if (nut || nutFailed) return nut;
  try {
    const m = await import('@nut-tree-fork/nut-js');
    nut = m.mouse ? m : m.default;
  } catch (err) {
    nutFailed = true;
    console.log('[cat] mischief mode is unavailable:', err.message);
  }
  return nut;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function nudgeCursor(dx) {
  if (!settings.get('mischief') || paused || hidden || nudging) return;
  if (Date.now() - lastCursorMove < 2000) return;                  // you're using the mouse: leave it alone
  const api = await nutApi();
  if (!api) return;
  nudging = true;
  try {
    // We read the pointer with Electron (in DIP, like everything else here) and move it with
    // nut-js, which wants real screen pixels — on Windows those differ when display scaling is on.
    const toScreen = (p) => (process.platform === 'win32' ? screen.dipToScreenPoint(p) : p);
    const move = Math.max(-40, Math.min(40, Number(dx) || 0));       // at most 40 pixels
    const start = screen.getCursorScreenPoint();
    let last = start;
    for (let i = 1; i <= 15; i++) {                                 // over about 300 ms
      await wait(20);
      const now = screen.getCursorScreenPoint();
      if (Math.abs(now.x - last.x) > 2 || Math.abs(now.y - last.y) > 2) break;   // you moved it: stop at once
      const k = i / 15;
      const target = { x: Math.round(start.x + move * k * k * (3 - 2 * k)), y: start.y };
      const p = toScreen(target);
      await api.mouse.setPosition(new api.Point(Math.round(p.x), Math.round(p.y)));
      last = target;
    }
    lastCursor = screen.getCursorScreenPoint();                     // (our own nudge doesn't count as you moving it)
  } catch (err) {
    console.log('[cat] nudge failed:', err.message);
  }
  nudging = false;
}

// --- settings, menu and tray (Stage 8) ---------------------------------------------

function setMuted(muted) {
  settings.set('muted', muted);
  if (cat.win) cat.win.webContents.send('set-muted', muted);
}

function setPaused(value) {
  paused = value;
  settings.set('paused', value);
  if (paused) scareBird();
  if (cat.win) cat.win.webContents.send('set-paused', paused || hidden);
  refreshTray();
}

// Hide or show everything (the cat, its tree, toys, a visiting bird).
function setHidden(value) {
  hidden = value;
  if (hidden) scareBird();
  for (const body of [cat, tree, prop && prop.body]) {
    if (!body || !body.win || body.win.isDestroyed()) continue;
    if (hidden) body.win.hide();
    else if (!(prop && body === prop.body && prop.hidden)) showOnTop(body.win);
  }
  if (!hidden && cat.win) cat.win.moveTop();
  if (cat.win) cat.win.webContents.send('set-paused', paused || hidden);
  refreshTray();
}

function setSpeed(name) {
  settings.set('speed', name);
  if (cat.win) cat.win.webContents.send('set-speed', SPEEDS[name] || 1);
}

function setMischief(on) {
  settings.set('mischief', on);
  if (cat.win) cat.win.webContents.send('set-mischief', on);
  if (on) nutApi();                                                 // load it now, so it's ready
}

// A new size needs new windows, so the app restarts itself.
function setSize(name) {
  if (name === settings.get('size')) return;
  settings.set('size', name);
  app.relaunch();
  app.exit(0);
}

// The same menu for the tray icon and for right-clicking the kitten.
function menuTemplate() {
  const hasSounds = Boolean(soundOverrides.meow || soundOverrides.purr);
  const radio = (label, key, value, onPick) => ({
    label, type: 'radio', checked: settings.get(key) === value, click: () => onPick(value),
  });
  const login = app.getLoginItemSettings();
  return [
    { label: hidden ? 'Show cat' : 'Hide cat', click: () => setHidden(!hidden) },
    { label: 'Pause', type: 'checkbox', checked: paused, click: (item) => setPaused(item.checked) },
    { type: 'separator' },
    { label: 'Fill the food bowl', enabled: !hidden, click: () => createProp('bowl') },
    { label: 'Give a treat (fish)', enabled: !hidden, click: () => createProp('fish') },
    { label: 'Bath time', enabled: !hidden, click: () => createProp('tub') },
    { label: 'Play with the yarn ball', enabled: !hidden, click: () => createProp('yarn') },
    { label: 'Put toys away', enabled: Boolean(prop), click: () => removeProp(true) },
    {
      label: 'Cat tree', type: 'checkbox', checked: Boolean(tree),
      click: (item) => { settings.set('tree', item.checked); if (item.checked) createTree(); else removeTree(); },
    },
    { type: 'separator' },
    {
      label: 'Cat size (restarts the cat)', submenu: [
        radio('Small', 'size', 'small', setSize),
        radio('Medium', 'size', 'medium', setSize),
        radio('Large', 'size', 'large', setSize),
      ],
    },
    {
      label: 'Walking speed', submenu: [
        radio('Slow', 'speed', 'slow', setSpeed),
        radio('Normal', 'speed', 'normal', setSpeed),
        radio('Fast', 'speed', 'fast', setSpeed),
      ],
    },
    {
      label: 'Mischief mode (nudges the pointer)', type: 'checkbox', checked: settings.get('mischief'),
      click: (item) => setMischief(item.checked),
    },
    ...(hasSounds ? [{ label: 'Mute sounds', type: 'checkbox', checked: settings.get('muted'), click: (item) => setMuted(item.checked) }] : []),
    {
      // Only works for the installed app (from "npm start" it would register Electron itself).
      label: app.isPackaged ? 'Launch at startup' : 'Launch at startup (installed app only)',
      type: 'checkbox', checked: login.openAtLogin, enabled: app.isPackaged,
      click: (item) => { app.setLoginItemSettings({ openAtLogin: item.checked }); refreshTray(); },
    },
    { type: 'separator' },
    { label: 'Quit Desktop Cat', click: () => app.quit() },
  ];
}

function refreshTray() {
  if (tray) tray.setContextMenu(Menu.buildFromTemplate(menuTemplate()));
}

function createTray() {
  // tray.png is 16x16; Electron automatically uses tray@2x.png on sharper screens.
  const icon = nativeImage.createFromPath(path.join(assetsDir, 'icons', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('Desktop Cat');
  refreshTray();
  // Windows: a left click opens the menu too (on a Mac any click does already).
  tray.on('click', () => { if (process.platform === 'win32') tray.popUpContextMenu(); });
}

ipcMain.on('show-menu', () => {
  if (!cat.win) return;
  Menu.buildFromTemplate(menuTemplate()).popup({ window: cat.win });
});
ipcMain.on('nudge-cursor', (_event, dx) => nudgeCursor(dx));

// --- app lifecycle ---
app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) app.dock.hide();  // Mac: no Dock icon, it's a menu-bar app
  createCatWindow();
  createTray();
  if (settings.get('tree')) cat.win.webContents.once('did-finish-load', () => createTree());
  if (settings.get('mischief')) nutApi();
  setInterval(checkFrontWindow, 2500);                             // Stage 7: is there a window to climb?
  screen.on('display-added', resnap);
  screen.on('display-removed', resnap);
  screen.on('display-metrics-changed', resnap);   // resolution, scaling or taskbar changed
});

// Started Desktop Cat again while it's running: just show the cat.
app.on('second-instance', () => { if (hidden) setHidden(false); });

// Toys, the tree and the bird are windows too; keep running until "Quit".
app.on('window-all-closed', () => app.quit());
