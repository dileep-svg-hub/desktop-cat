/*
  src/renderer/cat.js  —  the cat's brain
  ----------------------------------------------------------
  The brain is a small "state machine": the cat is always in exactly one
  state, and each state knows what animation to play and when it's over.

    idle     stand around; looks up if your mouse is just above it
    sit      sit down                       (lasts a few seconds)
    groom    lick a paw                     (lasts a few seconds)
    walk     stroll along the floor, staying near its "home"
    run      hurry back home when it's far away (e.g. moving to the other corner)
    chase    run after your mouse pointer, then sit and look up at it
    look     look up at the pointer         (lasts a few seconds)
    stretch  big stretch                    (plays once)
    yawn     yawn                           (plays once)
    sleep    curl up with a "zzz"           (until you wake it, or 5–15 min)
    wake     open eyes, then stretch        (plays once)
    happy    little hop with hearts when clicked (plays once)
    meow     meows (with sound) every few minutes, to get your attention
  carried  dangling from your mouse while you drag it
    fall     dropped in mid-air: falling (main does the actual gravity)
    land     touch-down after a fall        (plays once)

  HOME: the cat likes the bottom corners of the screen. `home` is 'left' or
  'right' and the cat stays within CORNER_ZONE pixels of that edge. Once in a
  while it trots over to the other corner. If you drag it somewhere else and
  drop it, that spot becomes its home ("play mode") until its next nap; after
  waking up it goes back to the nearest corner.

  When a state is over, next() picks the following one. If nobody has touched
  the cat for SLEEP_AFTER seconds, it yawns and falls asleep. Hovering over or
  clicking a sleeping cat wakes it up.

  LOOKS: kitten.js draws the kitten (soft, fluffy, smoothly animated).

  PLAY MODE (right-click menu): main puts a play thing on the floor and tells
  us where it is. The kitten runs over ('goto') and then:
    food bowl / fish  -> eatside (head in the bowl, food goes down) -> happy
    bathtub           -> hopin -> bath (bubbles, rubber duck) -> hopout -> shake -> happy
    yarn ball         -> bat (crouch, wiggle, swipe!) -> chase it again… -> happy, then a rest
  Drop the kitten from high up and it lands with a squish (and gets dizzy if
  it was a really big drop).

  WINDOWS (Stage 7): sometimes it runs under the window you're using and jumps
  onto its top edge ('gotoRoof' -> leap to 'roof'); main keeps it on the window.

  SETTINGS (Stage 8, tray menu): walking speed, Pause (holds still), Hide.
  MISCHIEF (Stage 9, off by default): if the pointer rests right beside it, it
  may bat at it ('bat' with mischiefBat) and main nudges the pointer ≤ 40 px.

  CAT TREE: now and then (and when it's sleepy) the kitten runs to the tree
  and climbs it by jumping platform to platform ('gotoTree' -> 'leap'…), then
  sits, grooms or naps up there ('perch' is set) until it jumps down. While it
  sits high up a sparrow may visit: the kitten watches it ('watch'), and when
  the bird lands beside it, it pounces ('reach')… and the bird flies away.

  SOUNDS (sounds.js): silent unless you add your own recordings to
  assets/sounds. Then it purrs when clicked or petted, meows now and then,
  and mews after a big fall. Right-click the cat for a menu with "Quit"
  (and "Mute sounds" when there are recordings).

  While asleep the brain only "ticks" 10 times a second instead of 60, so
  the cat uses very little CPU.

  The brain never moves the window itself: it asks main ("the legs") via
  catAPI.moveBy(dx), and main answers if the cat bumped into a wall.
*/

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { willReadFrequently: true }); // we read pixels for hit-testing

// Walking speed in sprite pixels per second (multiplied by the scale on screen).
// 20 matches the walk animation's paw steps; Stage 8 makes this a setting.
const WALK_SPEED = 20;
const RUN_SPEED = 55;           // when hurrying home or chasing
const CORNER_ZONE = 260;        // how far from the screen edge the cat likes to stay (screen pixels)
const PLAY_ZONE = 90;           // after you drop it: how far it strolls either side of that spot
const FAR = 60;                 // further than this from home -> run back instead of strolling
const SWITCH_CORNER = 0.08;     // chance, each time it sets off walking, to head for the other corner
const SLEEP_AFTER = 3 * 60;     // seconds without attention before the cat gets sleepy
const SLEEP_TICK_MS = 100;      // how often the brain wakes up while asleep (10x a second: smooth breathing, little CPU)
const DRAG_THRESHOLD = 4;       // move the mouse this many pixels while holding = drag, not click
const MEOW_EVERY = [90, 300];   // seconds between meows on its own [min, max]
const PET_TIME = 1.2;           // seconds of pointer resting on the cat before it purrs
const PURR_COOLDOWN = 5;        // seconds before it can purr again from petting
const DIZZY_DROP = 450;         // dropped from higher than this (screen pixels) -> dizzy for a moment

// Play mode (Stage 6)
const EAT_GAP = 19;             // how far (in 64-box units) the kitten stands from its bowl/fish to eat
const BAT_GAP = 15;             // …and from the yarn ball to bat it
const EAT_TIME = { bowl: 6, fish: 3 };   // seconds to finish the food
const BATH_TIME = [7, 9];       // seconds in the bath
const YARN_BATS = [3, 6];       // bats in a row before it needs a rest
const YARN_REST = 40;           // seconds of rest before it plays with the yarn again by itself
const GIVE_UP = 20;             // seconds trying to reach a play thing before giving up for a while

// Cat tree + sparrow
const TREE_CHANCE = 0.22;       // chance, when it sets off walking, to go and climb the tree instead
const PERCH_STAY = [40, 90];    // seconds it stays up the tree [min, max] (unless it falls asleep)
const BIRD_CHANCE = 0.5;        // chance a sparrow visits while it sits on a high platform
const BIRD_COOLDOWN = 45;       // seconds between sparrow visits
const FAVOURITE_PERCH = [['top', 4], ['bowl', 3], ['left', 2], ['dish', 1]];   // where it likes to sit
const ROOF_CHANCE = 0.2;        // chance, when it sets off walking, to jump onto the window you're using (Stage 7)

// States that last until their animation finishes (the rest last a set time).
const ONE_SHOT = new Set(['stretch', 'yawn', 'wake', 'happy', 'land', 'meow', 'dizzy', 'hopin', 'hopout', 'shake', 'bat', 'reach']);
// How long the timed states last, in seconds [min, max]. 1e9 = "until something else ends it".
const DURATION = {
  idle: [2, 6], sit: [4, 10], groom: [3, 6], walk: [3, 9], sleep: [5 * 60, 15 * 60],
  look: [2, 4], run: [1e9, 1e9], chase: [1e9, 1e9], carried: [1e9, 1e9], fall: [1e9, 1e9],
  goto: [1e9, 1e9], eatside: [1e9, 1e9], bath: BATH_TIME,
  gotoTree: [1e9, 1e9], leap: [1e9, 1e9], watch: [1e9, 1e9], gotoRoof: [1e9, 1e9],
};
// Which animation each state plays (if it isn't the one with the same name).
const ANIM = { chase: 'run', goto: 'run', gotoTree: 'run', gotoRoof: 'run', leap: 'jump', watch: 'look' };

let scale = 2;             // sprite scale, sent by main process
let sheet = null;          // the kitten's drawing box: { cell: 64, floor: 60 }
let anim = null;           // KittenAnimator (kitten.js)
let dir = 1;               // 1 = walking/facing right, -1 = left
let overCat = false;       // is the pointer currently on the cat's pixels?
let home = 'right';        // 'left' / 'right' corner, or a number = a "play spot" (screen x) after a drop
let place = null;          // { cx, left, right } from main: where the cat is on its screen
let cursor = null;         // { x, y, sameDisplay, floor } from main: where the mouse pointer is

let state = 'idle';
let stateTime = 0;         // seconds spent in the current state
let stateDuration = 0;     // how long to stay in it (timed states only)
let lastAttention = performance.now() / 1000;   // last hover or click, in seconds

let press = null;          // where you pressed the mouse button on the cat (before we know if it's a drag)
let dragging = false;
let lastDrop = 0;          // how far the cat fell last time (screen pixels)

let prop = null;           // the play thing from main: { kind, cx, level, moving, reason } or null
let tubHidden = false;     // we asked main to hide the tub window (the cat draws the tub while bathing)
let batsLeft = 4;          // yarn bats before it needs a rest
let yarnRestUntil = 0;     // ignore the yarn until this time (seconds)
let giveUpUntil = 0;       // couldn't reach the play thing: leave it alone until this time
let kicked = false;        // already hit the yarn during this 'bat'
let lastLevelSent = 0;
let startLevel = 1;        // how full the bowl was when it started eating

let treeInfo = null;       // the cat tree from main: { left, right, perches: { name: { x, y } } } or null
let perch = null;          // which platform the kitten is sitting on (null = on the floor)
let climbPlan = [];        // platforms still to jump to, e.g. ['bowl', 'top']
let treeGoal = null;       // the platform it's heading for
let perchSince = 0;        // when it got up there
let perchStay = 60;        // how long it'll stay
let nextBirdOk = 0;        // no sparrow visits before this time
let birdInfo = null;       // the visiting sparrow: { phase, x, y, catX } or null
let roofInfo = null;       // the window it could climb onto: { left, right, top } or null
let roofX = 0;             // where along that window it'll jump up

let speedMul = 1;          // walking speed setting (slow 0.6, normal 1, fast 1.6)
let paused = false;        // "Pause" (or "Hide cat") from the menu: hold still
let mischief = false;      // mischief mode: sometimes bat the mouse pointer
let mischiefBat = false;   // the current 'bat' is at the pointer, not the yarn
let nextMischiefOk = 0;

const rand = (min, max) => min + Math.random() * (max - min);
const nowSec = () => performance.now() / 1000;

let nextMeowAt = nowSec() + rand(20, 60);   // first meow fairly soon after starting
let hoverSince = null;     // when the pointer started resting on the cat
let lastPurr = -1e9;

// --- canvas sizing (handles high-DPI screens so the drawing stays sharp) ---
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', () => { resizeCanvas(); render(); });

// Where the cat's cell is drawn: horizontally centred, feet on the window's bottom edge.
function catRect() {
  const size = sheet.cell * scale;                       // on-screen cell size
  const footGap = (sheet.cell - sheet.floor) * scale;    // empty pixels under the feet in the art
  return {
    x: Math.round((window.innerWidth - size) / 2),
    y: window.innerHeight - size + footGap,
    size,
  };
}

// --- the "zzz" -------------------------------------------------------------
// Where the sleeping kitten's head is inside its 64x64 box (head is on the LEFT in the drawing).
const SLEEP_HEAD = { x: 16, y: 28 };

// One soft, rounded Z: a brown outline stroke, then a white stroke on top.
function drawSoftZ(px, py, s, alpha) {
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + s, py);
    ctx.lineTo(px, py + s);
    ctx.lineTo(px + s, py + s);
  };
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  path(); ctx.lineWidth = s * 0.32 + 2.4; ctx.strokeStyle = 'rgba(107, 59, 31, 0.85)'; ctx.stroke();
  path(); ctx.lineWidth = s * 0.32; ctx.strokeStyle = '#ffffff'; ctx.stroke();
  ctx.restore();
}

// Three Zs that float up from the head and fade out, one after another.
function drawZzz(r) {
  const period = 3;                           // seconds for one Z to float away
  for (let i = 0; i < 3; i++) {
    const t = ((stateTime / period) + i / 3) % 1;          // 0 → 1 as it rises
    const size = 4.5 + t * 3.5;                            // in 64-box units; grows as it rises
    let x = SLEEP_HEAD.x + 2 + t * 16;                     // drifts sideways…
    const y = SLEEP_HEAD.y - 8 - t * 34;                   // …and upwards
    if (dir < 0) x = sheet.cell - x - size;                // kitten is mirrored -> mirror the Zs too
    const fade = t < 0.6 ? Math.min(1, t * 6) : 1 - (t - 0.6) / 0.4;
    drawSoftZ(r.x + x * scale, r.y + y * scale, size * scale, fade);
  }
}

// --- hearts ------------------------------------------------------------------
// One or two soft, lopsided hearts pop out when you click the kitten. Each one
// gets its own random shape, tilt and spin, so they look hand-drawn, not stamped.
let hearts = [];
const HEART_LIFE = 1.6;
function spawnHearts() {
  const count = Math.random() < 0.65 ? 1 : 2;
  for (let i = 0; i < count; i++) {
    hearts.push({
      age: -i * 0.3,                            // the second one comes a moment later
      x: 32 + rand(-9, 9),
      drift: rand(-10, 10),
      size: rand(8, 11),
      rot: rand(-0.5, 0.5),
      spin: rand(-0.6, 0.6),
      lobeL: rand(0.75, 1.2),                   // left and right halves of different sizes
      lobeR: rand(0.75, 1.2),
      tip: rand(-0.3, 0.3),                     // point leaning to one side
      sketch: Math.random() < 0.35,             // sometimes just a doodled outline
    });
  }
}
function updateHearts(dt) {
  for (const h of hearts) h.age += dt;
  hearts = hearts.filter((h) => h.age < HEART_LIFE);
}

// A heart about 1 unit tall, centred on (0, 0), using the heart's own random shape.
function heartPath(h) {
  const L = h.lobeL, R = h.lobeR, tx = h.tip;
  ctx.beginPath();
  ctx.moveTo(tx, 0.62);
  ctx.bezierCurveTo(-0.35 - 0.3 * L, 0.25, -0.78 * L, -0.25 * L, -0.42 * L, -0.52 * L);
  ctx.bezierCurveTo(-0.2 * L, -0.7 * L, 0.02, -0.5, 0.02, -0.28);
  ctx.bezierCurveTo(0.04, -0.52, 0.2 * R, -0.72 * R, 0.45 * R, -0.52 * R);
  ctx.bezierCurveTo(0.8 * R, -0.25 * R, 0.35 + 0.3 * R, 0.25, tx + 0.06, 0.6);
}

function drawHearts(r) {
  for (const h of hearts) {
    if (h.age < 0) continue;
    const t = h.age / HEART_LIFE;                                 // 0 → 1
    const px = r.x + (h.x + h.drift * t + Math.sin(h.age * 5) * 1.2) * scale;   // gentle wobble
    const py = r.y + (4 - t * 40) * scale;                        // starts above the head, floats up
    const size = h.size * scale * (0.6 + 0.4 * Math.min(1, t * 5));             // pops in
    ctx.save();
    ctx.globalAlpha = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
    ctx.translate(px, py);
    ctx.rotate(h.rot + h.spin * h.age);
    ctx.scale(size, size);
    heartPath(h);
    if (h.sketch) {
      ctx.lineWidth = 0.15;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#ff6f95';
      ctx.stroke();
    } else {
      const g = ctx.createLinearGradient(0, -0.6, 0, 0.6);
      g.addColorStop(0, '#ffa8bf');
      g.addColorStop(1, '#ff5f8c');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-0.3 * h.lobeL, -0.32, 0.13, 0.07, -0.6, 0, Math.PI * 2);   // little shine
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fill();
    }
    ctx.restore();
  }
}

function render() {
  if (!sheet) return;
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  const r = catRect();
  anim.draw(ctx, r.x, r.y, r.size, dir < 0);   // the art faces right; flip it when going left
  if (state === 'sleep') drawZzz(r);
  if (hearts.length) drawHearts(r);
}

// --- states ---
// params: extra details for the pose, e.g. { height } for 'land'.
function setState(name, params = {}) {
  state = name;
  stateTime = 0;
  kicked = false;
  const d = DURATION[name];
  stateDuration = d ? rand(d[0], d[1]) : 0;
  if (name === 'walk' && Math.random() < 0.4) dir = -dir;   // sometimes change direction
  if (name === 'wake' && typeof home === 'number') home = nearestCorner();   // play time is over
  if (name === 'meow') { sounds.meow(); nextMeowAt = nowSec() + rand(MEOW_EVERY[0], MEOW_EVERY[1]); }
  anim.play(ANIM[name] || name, { restart: true, params });
  render();
}

// --- play mode: food bowl, fish snack, bathtub, yarn ball ----------------------

// Does the kitten want to go to the play thing right now?
function wantsProp() {
  if (!prop || overCat || dragging || nowSec() < giveUpUntil) return false;
  if (prop.kind === 'yarn') return nowSec() > yarnRestUntil;
  return true;
}

// Where the kitten should stand (screen x of its centre): in the tub exactly,
// or just beside the bowl / fish / yarn, on whichever side it's coming from.
function propTarget() {
  if (prop.kind === 'tub') return prop.cx;
  const gap = (prop.kind === 'yarn' ? BAT_GAP : EAT_GAP) * scale;
  return place.cx < prop.cx ? prop.cx - gap : prop.cx + gap;
}

// --- the cat tree ---------------------------------------------------------------

function pickPerch() {
  let roll = Math.random() * FAVOURITE_PERCH.reduce((s, [, w]) => s + w, 0);
  for (const [name, w] of FAVOURITE_PERCH) { roll -= w; if (roll <= 0) return name; }
  return 'top';
}

// Climb platform by platform: low dish -> bowl bed -> the one it wants.
function climbPath(goal) {
  if (goal === 'dish') return ['dish'];
  if (goal === 'bowl') return ['dish', 'bowl'];
  return ['dish', 'bowl', goal];
}

// Jump to the next platform in the plan (main does the flying; we play the jump pose).
function leapNext() {
  const name = climbPlan.shift();
  const target = name !== 'floor' && name !== 'roof' && treeInfo ? treeInfo.perches[name] : null;
  if (target && place) dir = target.x >= place.cx ? 1 : -1;
  setState('leap');
  window.catAPI.leap(name, name === 'roof' ? roofX : undefined);
}

function leaveTree() {
  climbPlan = ['floor'];
  leapNext();
}

// What to do next while sitting up the tree.
function perchNext() {
  const t = nowSec();
  if (state === 'reach') return 'sit';                                  // missed the bird…
  if (t - lastAttention > SLEEP_AFTER) return state === 'yawn' ? 'sleep' : 'yawn';   // nap up here
  if (wantsProp() || t - perchSince > perchStay) { leaveTree(); return null; }   // time to get down
  if ((perch === 'top' || perch === 'left' || perch === 'roof') && !birdInfo && t > nextBirdOk && Math.random() < BIRD_CHANCE) {
    nextBirdOk = t + BIRD_COOLDOWN;
    window.catAPI.birdCome();                                           // a sparrow is on its way
  }
  const options = ['idle', 'sit', 'sit', 'groom'];
  return options[Math.floor(Math.random() * options.length)];
}

// Reached the play thing: face it and start eating / bathing / batting.
function arrive() {
  dir = prop.cx >= place.cx ? 1 : -1;
  home = prop.cx;                                  // play mode: hang around here afterwards
  lastAttention = nowSec();
  if (prop.kind === 'tub') {
    window.catAPI.propHide();                      // the kitten draws the tub itself while bathing
    tubHidden = true;
    setState('hopin');
  } else if (prop.kind === 'yarn') {
    setState('bat');
  } else {
    startLevel = prop.level;
    setState('eatside');
    stateDuration = EAT_TIME[prop.kind] * Math.max(0.2, startLevel);   // a half-eaten bowl takes less time
  }
}

// --- home ---
function nearestCorner() {
  if (!place) return 'right';
  return place.cx - place.left < place.right - place.cx ? 'left' : 'right';
}

// The stretch of floor the cat likes to stay on: [from, to] in screen pixels.
function homeRange() {
  if (home === 'left') return [place.left, place.left + CORNER_ZONE];
  if (home === 'right') return [place.right - CORNER_ZONE, place.right];
  return [home - PLAY_ZONE, home + PLAY_ZONE];             // a play spot where you dropped it
}

// How far the cat is outside its home stretch: 0 = at home,
// negative = that many pixels to the LEFT of it, positive = to the RIGHT.
function awayFromHome() {
  if (!place) return 0;
  const [from, to] = homeRange();
  if (place.cx < from) return place.cx - from;
  if (place.cx > to) return place.cx - to;
  return 0;
}

// --- the mouse pointer ---
// Is the pointer on our screen, roughly above the cat (so it should look up)?
function cursorAbove() {
  if (!cursor || !place || !cursor.sameDisplay) return false;
  const catTop = cursor.floor - sheet.cell * scale;
  return Math.abs(cursor.x - place.cx) < 160 && cursor.y < catTop && cursor.y > catTop - 500;
}

// Feel like chasing the pointer? More likely when it's nearby.
function wantsToChase() {
  if (!cursor || !place || !cursor.sameDisplay) return false;
  const near = Math.abs(cursor.x - place.cx) < 500;
  return Math.random() < (near ? 0.35 : 0.12);
}

// Mischief mode: is the pointer resting (2 s+) just beside the kitten?
function wantsMischief() {
  if (!mischief || perch || overCat || !cursor || !place || !cursor.sameDisplay) return false;
  if (nowSec() < nextMischiefOk || cursor.idleMs < 2000) return false;
  const near = Math.abs(cursor.x - place.cx) < 140 && cursor.y > cursor.floor - 220 && cursor.y < cursor.floor + 5;
  return near && Math.random() < 0.8;
}

// Pick a "resting" thing to do, some more often than others.
function pickRest() {
  const options = [['idle', 3], ['sit', 2], ['groom', 1.5], ['stretch', 1], ['yawn', 0.7]];
  let roll = Math.random() * options.reduce((sum, [, w]) => sum + w, 0);
  for (const [name, weight] of options) {
    roll -= weight;
    if (roll <= 0) return name;
  }
  return 'idle';
}

// What to do when the current state is over.
function next() {
  if (state === 'sleep') { lastAttention = nowSec(); return 'wake'; }   // slept enough: wake up by itself
  if (state === 'wake') return 'stretch';
  if (perch) return perchNext();                           // up the tree: different rules
  if (state === 'land') return lastDrop > DIZZY_DROP ? 'dizzy' : pickRest();
  // play mode sequences
  if (state === 'eatside') { window.catAPI.propLevel(0); window.catAPI.propDone(); spawnHearts(); return 'happy'; }   // all gone, yum!
  if (state === 'hopin') return 'bath';
  if (state === 'bath') { window.catAPI.propDone(); tubHidden = false; return 'hopout'; }
  if (state === 'hopout') return 'shake';
  if (state === 'shake') { spawnHearts(); return 'happy'; }
  if (state === 'bat' && mischiefBat) { mischiefBat = false; return 'sit'; }   // innocent face
  if (state === 'bat') {
    if (batsLeft <= 0) { yarnRestUntil = nowSec() + YARN_REST; spawnHearts(); return 'happy'; }   // that was fun, need a breather
    return wantsProp() ? 'goto' : 'sit';
  }
  if (wantsProp()) return 'goto';
  if (state === 'look' || state === 'dizzy') return pickRest();
  const sleepy = nowSec() - lastAttention > SLEEP_AFTER;
  if (Math.abs(awayFromHome()) > FAR && !overCat) return 'walk';   // go home first (walk turns into a run)
  if (sleepy && treeInfo && state !== 'yawn' && !overCat) { treeGoal = 'bowl'; return 'gotoTree'; }   // nap in the bowl bed
  if (sleepy) return state === 'yawn' ? 'sleep' : 'yawn';   // yawn first, then curl up
  if (nowSec() > nextMeowAt) return 'meow';                // "hey, notice me!"
  if (wantsMischief()) {                                   // the pointer is resting right here… bat it!
    mischiefBat = true;
    nextMischiefOk = nowSec() + rand(20, 60);
    dir = cursor.x >= place.cx ? 1 : -1;
    return 'bat';
  }
  if (state === 'walk' || overCat) return pickRest();      // don't wander off while you're pointing at it
  if (Math.random() < 0.6) {
    if (wantsToChase()) return 'chase';
    if (treeInfo && Math.random() < TREE_CHANCE) { treeGoal = pickPerch(); return 'gotoTree'; }   // climb the tree!
    if (roofInfo && Math.random() < ROOF_CHANCE) return 'gotoRoof';                               // up onto your window!
    if (typeof home === 'string' && Math.random() < SWITCH_CORNER) home = home === 'left' ? 'right' : 'left';   // off to the other corner!
    return 'walk';
  }
  return pickRest();
}

// Someone paid attention to the cat (hover or click).
function attention() {
  lastAttention = nowSec();
  if (state === 'sleep') { setState('wake'); return true; }
  return false;
}

// Moving the window is a message to main and back. While one move is on its
// way we add up the distance and send it all together, so messages never pile up.
let pendingDx = 0;
let moveInFlight = false;
function requestMove(dx) {
  if (perch) return;                             // no walking up the tree
  pendingDx += dx;
  if (moveInFlight) return;
  const send = pendingDx;
  pendingDx = 0;
  moveInFlight = true;
  window.catAPI.moveBy(send).then((result) => {
    moveInFlight = false;
    if (!result) return;
    place = { cx: result.cx, left: result.left, right: result.right };
    if (!result.edge) return;
    if (state === 'chase') { setState('look'); return; }        // pointer is past the wall: sit and stare
    if (state === 'goto') { giveUpUntil = nowSec() + 30; setState('look'); return; }   // can't get there
    if (state === 'walk' || state === 'run') {
      dir = result.edge === 'left' ? 1 : -1;   // bumped into a wall -> turn around
      pendingDx = 0;
      render();
    }
  });
}

function think(dt) {
  stateTime += dt;

  if (state === 'walk' || state === 'run') {
    if (overCat) { setState('idle'); return; }  // stand still so it's easy to click
    const away = awayFromHome();
    if (away !== 0) {
      const homeDir = away > 0 ? -1 : 1;
      if (dir !== homeDir) { dir = homeDir; render(); }      // reached the end of its patch: turn back
    }
    if (state === 'walk' && Math.abs(away) > FAR) { setState('run'); return; }   // far from home: hurry
    if (state === 'run' && away === 0) { setState('walk'); return; }            // home again: slow down
    requestMove(dir * (state === 'run' ? RUN_SPEED : WALK_SPEED) * speedMul * scale * dt);
  }

  if (state === 'chase') {
    if (overCat) { setState('look'); return; }
    if (!cursor || !cursor.sameDisplay || !place || stateTime > 10) { setState(pickRest()); return; }  // lost interest
    const dx = cursor.x - place.cx;
    if (Math.abs(dx) < 20) {                                 // got there: look up at it
      setState('look');
      if (Math.random() < 0.4) sounds.meow({ short: true });
      return;
    }
    const want = dx > 0 ? 1 : -1;
    if (dir !== want) { dir = want; render(); }
    requestMove(dir * RUN_SPEED * speedMul * scale * dt);
  }

  if (state === 'goto') {                                    // heading for the play thing
    if (!prop || !place) { setState(pickRest()); return; }
    if (overCat) { setState('idle'); return; }
    if (stateTime > GIVE_UP) { giveUpUntil = nowSec() + 30; setState(pickRest()); return; }
    const dx = propTarget() - place.cx;
    if (Math.abs(dx) < 5) {
      if (!prop.moving) arrive();                            // (wait for a rolling ball to stop)
      return;
    }
    const want = dx > 0 ? 1 : -1;
    if (dir !== want) { dir = want; render(); }
    requestMove(want * Math.min(Math.abs(dx), RUN_SPEED * speedMul * scale * dt));
  }

  if (state === 'eatside' && prop) {                         // the food goes down as it eats
    const level = Math.max(0, startLevel * (1 - stateTime / stateDuration));
    if (nowSec() - lastLevelSent > 0.2) { window.catAPI.propLevel(level); lastLevelSent = nowSec(); }
  }

  if (state === 'gotoTree') {                                // run to the foot of the tree
    if (!treeInfo || !place) { setState(pickRest()); return; }
    if (overCat) { setState('idle'); return; }
    if (stateTime > GIVE_UP) { setState(pickRest()); return; }
    const dish = treeInfo.perches.dish;
    const dx = dish.x + (place.cx < dish.x ? -45 : 45) - place.cx;
    if (Math.abs(dx) < 5) { climbPlan = climbPath(treeGoal || pickPerch()); leapNext(); return; }
    const want = dx > 0 ? 1 : -1;
    if (dir !== want) { dir = want; render(); }
    requestMove(want * Math.min(Math.abs(dx), RUN_SPEED * speedMul * scale * dt));
  }

  if (state === 'gotoRoof') {                                // run underneath the window, then jump up
    if (!roofInfo || !place || overCat || stateTime > GIVE_UP) { setState(pickRest()); return; }
    if (!roofX || roofX < roofInfo.left + 50 || roofX > roofInfo.right - 50) {
      roofX = Math.min(Math.max(place.cx, roofInfo.left + 70), roofInfo.right - 70);   // the nearest good spot
    }
    const dx = roofX - place.cx;
    if (Math.abs(dx) < 5) { climbPlan = ['roof']; leapNext(); return; }
    const want = dx > 0 ? 1 : -1;
    if (dir !== want) { dir = want; render(); }
    requestMove(want * Math.min(Math.abs(dx), RUN_SPEED * speedMul * scale * dt));
  }

  if (state === 'reach' && !kicked && anim.t > ONE_SHOT_LEN.reach * 0.5) {   // paws clap at the top of the leap…
    kicked = true;
    window.catAPI.birdScare();                                                 // …and the sparrow gets away
  }

  if (state === 'bat' && !kicked && anim.t > ONE_SHOT_LEN.bat * 0.62) {   // the swipe connects: whack!
    kicked = true;
    if (mischiefBat) {
      window.catAPI.nudgeCursor(dir * 35);                   // mischief: the pointer gets batted along a bit
    } else {
      batsLeft--;
      window.catAPI.propKick(dir * rand(380, 650));
    }
  }

  if (state === 'idle') anim.play(cursorAbove() ? 'look' : 'idle');   // glance up at the pointer

  const over = ONE_SHOT.has(state) ? anim.done : stateTime > stateDuration;
  if (over) {
    const following = next();                    // (null = next() already started something, e.g. a jump)
    if (following) setState(following);
  }
}

// --- hit-testing: is there an opaque pixel under the pointer? ---
function isOpaqueAt(clientX, clientY) {
  const dpr = window.devicePixelRatio || 1;
  const px = Math.floor(clientX * dpr), py = Math.floor(clientY * dpr);
  if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return false;
  return ctx.getImageData(px, py, 1, 1).data[3] > 0;
}

function setOverCat(value) {
  if (value === overCat) return;
  overCat = value;
  hoverSince = value ? nowSec() : null;
  canvas.classList.toggle('over-cat', value);
  // Over the cat -> window accepts clicks. Elsewhere -> clicks fall through.
  window.catAPI.setIgnoreMouse(!value);
}

// --- mouse: hover, click, drag -------------------------------------------
function startDrag() {
  dragging = true;
  attention();
  hearts = [];
  if (tubHidden) { window.catAPI.propShow(); tubHidden = false; }   // lifted out of the bath: the tub stays behind
  perch = null;                                                     // lifted off the tree
  climbPlan = [];
  window.catAPI.dragStart(press.x, press.y);    // main keeps this spot of the window under the pointer
  canvas.classList.add('grabbing');
  setState('carried');
}

function endDrag() {
  dragging = false;
  press = null;
  canvas.classList.remove('grabbing');
  window.catAPI.dragEnd();                      // main lets go: falls to the floor, then sends 'landed'
  setState('fall');
  // Start click-through again; the next mouse move re-checks whether we're over the cat.
  overCat = false;
  canvas.classList.remove('over-cat');
  window.catAPI.setIgnoreMouse(true);
}

function click() {
  if (attention()) return;                      // it was asleep: just wake up
  window.catAPI.log('You clicked the cat! purr');
  spawnHearts();
  setState('happy');
  sounds.purr(1.8);
  lastPurr = nowSec();
}

// Resting the pointer on the cat = petting it: it purrs (not too often).
function checkPetting() {
  if (!overCat || hoverSince === null || state === 'sleep') return;
  const t = nowSec();
  if (t - hoverSince > PET_TIME && t - lastPurr > PURR_COOLDOWN) {
    sounds.purr(1.5);
    lastPurr = t;
  }
}

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || !isOpaqueAt(e.clientX, e.clientY)) return;
  press = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener('mousemove', (e) => {
  const buttonHeld = (e.buttons & 1) === 1;
  if (dragging) {
    if (!buttonHeld) endDrag();                 // the button was released somewhere we didn't hear about
    return;
  }
  if (press) {
    if (!buttonHeld) { press = null; return; }
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_THRESHOLD) startDrag();
    return;                                     // while the button is held, keep catching the mouse
  }
  setOverCat(isOpaqueAt(e.clientX, e.clientY));
  if (overCat) attention();                     // hovering counts as attention (and wakes it)
});

window.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;
  if (dragging) endDrag();
  else if (press) { press = null; click(); }
});

canvas.addEventListener('mouseleave', () => { if (!press && !dragging) setOverCat(false); });

// Right-click on the cat -> the little menu (Mute sounds / Quit).
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (isOpaqueAt(e.clientX, e.clientY)) window.catAPI.showMenu();
});

window.catAPI.onSetMuted((muted) => sounds.setMuted(muted));

// Main tells us the dropped cat reached the floor.
window.catAPI.onLanded((info) => {
  place = { cx: info.cx, left: info.left, right: info.right };
  // Dropped inside a corner -> that corner is home. Anywhere else -> play there for a while.
  if (info.cx - info.left < CORNER_ZONE) home = 'left';
  else if (info.right - info.cx < CORNER_ZONE) home = 'right';
  else home = info.cx;
  lastDrop = info.height;
  if (info.height > 30) setState('land', { height: info.height });   // squish + dust (+ dizzy if it was a big drop)
  else setState('idle');
  if (info.height > 200) sounds.meow({ short: true });   // "mew!" after a big drop
});

// --- the cat tree and the sparrow ---
window.catAPI.onTree((t) => { treeInfo = t; });
window.catAPI.onRoof((r) => { roofInfo = r; roofX = 0; });     // the window you're using moved / changed

// Finished a jump: onto a platform (maybe keep climbing) or back down on the floor.
window.catAPI.onLeaped((info) => {
  place = { cx: info.cx, left: info.left, right: info.right };
  perch = info.perch;
  if (perch) {
    if (climbPlan.length) { leapNext(); return; }
    perchSince = nowSec();
    perchStay = rand(PERCH_STAY[0], PERCH_STAY[1]);
    setState(nowSec() - lastAttention > SLEEP_AFTER ? 'yawn' : 'sit');
  } else {
    lastDrop = 0;
    setState('land', { height: 40 });
  }
});

// The tree was moved or removed under the kitten: it falls off.
window.catAPI.onFalling(() => {
  perch = null;
  climbPlan = [];
  setState('fall');
});

// The sparrow: watch it fly round, pounce when it lands next to us.
window.catAPI.onBird((b) => {
  birdInfo = b;
  if (!b) { if (state === 'watch') setState('sit'); return; }
  if (!perch || dragging || state === 'sleep' || state === 'leap') return;
  const towardsBird = b.x >= b.catX ? 1 : -1;
  if (b.phase === 'arrive' || b.phase === 'circle' || b.phase === 'land') {
    if (state !== 'watch' && state !== 'reach') setState('watch');
    if (state === 'watch' && dir !== towardsBird) { dir = towardsBird; render(); }
  } else if (b.phase === 'perched' && state === 'watch') {
    dir = towardsBird;
    setState('reach');                              // crouch… wiggle… POUNCE!
  } else if (b.phase === 'escape' && state === 'watch') {
    setState('look');                               // watches it fly away
  }
});

// Main tells us about the play thing: put out, moved, rolling, or taken away.
window.catAPI.onProp((p) => {
  const hadProp = prop;
  prop = p;
  if (!p) { tubHidden = false; return; }
  if (p.reason === 'new' || p.reason === 'moved') {
    // Something new to play with (or you threw the yarn): forget any boredom and go for it!
    batsLeft = Math.round(rand(YARN_BATS[0], YARN_BATS[1]));
    yarnRestUntil = 0;
    giveUpUntil = 0;
    if (state === 'sleep') attention();             // wakes up for food and toys
    if (perch && !['leap', 'wake', 'stretch', 'reach'].includes(state)) { leaveTree(); return; }   // come down for it
    const busyStates = ['carried', 'fall', 'land', 'eatside', 'hopin', 'bath', 'hopout', 'shake', 'bat', 'wake', 'stretch', 'goto', 'dizzy'];
    if (!busyStates.includes(state) && !dragging) setState('goto');
    else if ((state === 'eatside' || state === 'bath') && hadProp) setState('goto');   // you moved it away mid-meal
  }
});

// Ask main where the pointer is, 4 times a second (not while asleep or carried).
setInterval(() => {
  if (!sheet || state === 'sleep' || dragging) return;
  window.catAPI.getCursor().then((c) => { cursor = c; });
}, 250);

// --- the animation loop ---
// Awake: run every screen refresh (smooth walking); the kitten repaints about
// 30 times a second. Asleep: tick 10 times a second, so the cat costs very little CPU.
let lastTime = performance.now();
function tick() {
  const now = performance.now();
  const dt = Math.min(state === 'sleep' ? 1 : 0.1, (now - lastTime) / 1000); // seconds; clamp after a stall
  lastTime = now;

  // Paused: hold still (finish a hop or a fall first), and tick slowly like when asleep.
  const holding = paused && !['carried', 'fall', 'land', 'leap'].includes(state);
  if (holding) {
    stateTime += dt;
    if (ONE_SHOT.has(state) && anim.done) setState('sit');
  } else {
    think(dt);
  }
  checkPetting();
  const frameChanged = anim.update(dt);
  const hadHearts = hearts.length > 0;
  updateHearts(dt);
  if (frameChanged || state === 'sleep' || hadHearts) render();   // Zs and hearts move every tick

  if (state === 'sleep' || holding) setTimeout(tick, SLEEP_TICK_MS);
  else requestAnimationFrame(tick);
}

// Settings from the menu.
const MOVING = ['walk', 'run', 'chase', 'goto', 'gotoTree', 'gotoRoof', 'eatside', 'bat', 'watch'];
function applyPaused(value) {
  paused = value;
  if (paused && MOVING.includes(state)) setState('sit');
}
window.catAPI.onSetPaused(applyPaused);
window.catAPI.onSetSpeed((v) => { speedMul = v; });
window.catAPI.onSetMischief((on) => { mischief = on; });

// --- start-up ---
window.catAPI.onConfig((config) => {
  scale = config.scale;
  sounds.setMuted(config.muted);
  sounds.setRecordings(config.sounds);
  speedMul = config.speed || 1;
  mischief = Boolean(config.mischief);
  resizeCanvas();
  if (!sheet) {
    sheet = KIT;                                 // the 64x64 box the kitten is drawn in (kitten.js)
    anim = new KittenAnimator();
    setState('idle');
    applyPaused(Boolean(config.paused));
    requestMove(0);                              // ask main where we are on the screen
    requestAnimationFrame(tick);
    window.catAPI.log('Cat is awake. Drag it around, click it, or leave it to nap.');
  } else {
    render();
  }
});
