/*
  src/renderer/prop.js  —  the page inside a play thing's window
  ---------------------------------------------------------------
  Draws one play thing (food bowl, fish snack, bathtub or yarn ball) using
  props.js, and lets you pick it up and move it. Like the kitten, clicks pass
  through everywhere except on the thing itself.

  Throw the yarn: drag it and let go while moving — it flies, bounces off the
  screen edges and rolls. Click the yarn to give it a little flick.

  The same page also shows the cat tree (drag it to move it) and the sparrow
  (click it to shoo it away).
*/

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { willReadFrequently: true });   // we read pixels for hit-testing

let kind = null;
let scale = 2;             // on-screen pixels per drawing unit
let box = { w: 64, h: 64 };   // the drawing's box (the tree's is bigger, the sparrow's smaller)
let level = 1;             // food left (1 = full)
let angle = 0;             // yarn roll
let flying = false;        // sparrow: wings flapping?
let facing = 1;            // sparrow: 1 = right, -1 = left
let alpha = 1;             // fades to 0 before the window is removed
let over = false;          // pointer on the thing?
let press = null;          // where the button went down (before we know if it's a drag)
let dragging = false;
const DRAG_THRESHOLD = 4;
const startTime = performance.now();

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', () => { resizeCanvas(); render(); });

function render() {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  if (!kind) return;
  const w = box.w * scale, h = box.h * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate((window.innerWidth - w) / 2, window.innerHeight - h + 4 * scale);   // floor (4 units above the box bottom) on the window's bottom edge
  if (facing < 0) { ctx.translate(w, 0); ctx.scale(-1, 1); }                         // sparrow flying left
  ctx.scale(scale, scale);
  drawProp(ctx, kind, level, (performance.now() - startTime) / 1000, angle, flying);
  ctx.restore();
}

// Things that move by themselves are redrawn on a timer: the sparrow 30x a second,
// the bath foam and tree pom-poms 10x. The rest only when something changes.
setInterval(() => { if (kind === 'bird') render(); }, 33);
setInterval(() => { if (kind === 'tub' || kind === 'tree') render(); }, 100);

// --- messages from main ---
window.catAPI.onPropConfig((c) => {
  kind = c.kind;
  scale = c.scale;
  box = { w: c.boxW || 64, h: c.boxH || 64 };
  level = c.level ?? 1;
  resizeCanvas();
  render();
});
window.catAPI.onPropAnim((a) => { flying = a.flying; facing = a.facing; render(); });   // the sparrow
window.catAPI.onPropLevel((v) => { level = v; render(); });
window.catAPI.onPropSpin((a) => { angle = a; render(); });
window.catAPI.onPropFade(() => {
  const start = performance.now();
  const fade = () => {
    alpha = Math.max(0, 1 - (performance.now() - start) / 450);
    render();
    if (alpha > 0) requestAnimationFrame(fade);
  };
  fade();
});

// --- mouse: hover, drag, flick ---
function isOpaqueAt(x, y) {
  const dpr = window.devicePixelRatio || 1;
  const px = Math.floor(x * dpr), py = Math.floor(y * dpr);
  if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return false;
  return ctx.getImageData(px, py, 1, 1).data[3] > 0;
}

function setOver(value) {
  if (value === over) return;
  over = value;
  canvas.classList.toggle('over-cat', value);       // hand cursor (same style as the kitten)
  window.catAPI.setIgnoreMouse(!value);
}

function endDrag() {
  dragging = false;
  press = null;
  canvas.classList.remove('grabbing');
  window.catAPI.dragEnd();
  over = false;
  canvas.classList.remove('over-cat');
  window.catAPI.setIgnoreMouse(true);
}

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || !isOpaqueAt(e.clientX, e.clientY)) return;
  press = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener('mousemove', (e) => {
  const held = (e.buttons & 1) === 1;
  if (dragging) { if (!held) endDrag(); return; }
  if (press) {
    if (!held) { press = null; return; }
    if (kind !== 'bird' && Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_THRESHOLD) {   // (you can't carry the sparrow)
      dragging = true;
      canvas.classList.add('grabbing');
      window.catAPI.dragStart(press.x, press.y);
    }
    return;
  }
  setOver(isOpaqueAt(e.clientX, e.clientY));
});

window.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;
  if (dragging) { endDrag(); return; }
  if (press && kind === 'yarn') {                    // a click on the yarn flicks it away from the pointer
    const away = press.x < window.innerWidth / 2 ? 1 : -1;
    window.catAPI.propKick(away * 450);
  }
  if (press && kind === 'bird') window.catAPI.birdScare();   // shoo!
  press = null;
});

canvas.addEventListener('mouseleave', () => { if (!press && !dragging) setOver(false); });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
