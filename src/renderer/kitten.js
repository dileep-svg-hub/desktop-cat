/*
  src/renderer/kitten.js  —  draws the kitten
  --------------------------------------------
  Instead of a sheet of pre-made pixel pictures, the kitten is drawn fresh
  ~30 times a second from soft shapes: fluffy "blobs" for the head and body,
  thick rounded strokes for the tail and legs, big glossy eyes. Each pose
  (walk, sit, sleep…) is a small function that places the body parts using
  the time since the pose started, so motion is smooth instead of jumping
  between a few frames.

  Everything is measured in a 64 x 64 box ("cell"), with the floor at y = 60.
  The drawing is scaled up to the real size on screen, so it stays sharp.
  Side-view poses face RIGHT; cat.js mirrors the drawing to face left.

  Want a different-looking cat? Start with the colours in COL below.
*/

const KIT = { cell: 64, floor: 60 };

const COL = {
  fur: '#f6a24c',          // orange tabby
  furLight: '#ffd296',
  furDark: '#e2832f',
  stripe: '#cf6f26',
  cream: '#fff8ec',        // chest, muzzle, paws
  line: '#6b3b1f',         // soft brown outline
  earPink: '#f8aab6',
  nose: '#f0849a',
  blush: 'rgba(255, 120, 140, 0.32)',
  eye: '#1b1416',
  mouthIn: '#8a3a3a',
  tongue: '#f48aa0',
};
const LW = 1.1;            // outline thickness (in cell units)

const TAU = Math.PI * 2;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (p) => { p = clamp01(p); return p * p * (3 - 2 * p); };   // gentle ease in/out
const hump = (p) => Math.sin(Math.PI * clamp01(p));                       // 0 → 1 → 0
const clock = () => performance.now() / 1000;

// --- shape helpers -----------------------------------------------------------

// A soft, fluffy oval. `tufts` adds little pointed fur tufts around the edge:
// { a: angle (0 = right, PI/2 = bottom), w: half-width of the tufty area, s: tuft height, n: how many }
function blobPath(ctx, cx, cy, rx, ry, tufts = [], rot = 0) {
  const N = 72;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    let extra = 0;
    for (const t of tufts) {
      const d = Math.atan2(Math.sin(a - t.a), Math.cos(a - t.a));
      if (Math.abs(d) >= t.w) continue;
      const local = (d + t.w) / (2 * t.w);
      const saw = 1 - Math.abs(((local * t.n) % 1) * 2 - 1);
      extra += t.s * Math.pow(saw, 1.6) * Math.sin(Math.PI * local);
    }
    const x = Math.cos(a) * (rx + extra);
    const y = Math.sin(a) * (ry + extra);
    pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  ctx.beginPath();
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const start = mid(pts[N - 1], pts[0]);
  ctx.moveTo(start[0], start[1]);
  for (let i = 0; i < N; i++) {
    const p = pts[i];
    const m = mid(p, pts[(i + 1) % N]);
    ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  }
  ctx.closePath();
}

// Soft fur shading: light at the top-left, darker towards the bottom-right.
function furFill(ctx, cx, cy, r) {
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.5, r * 0.1, cx, cy, r * 1.35);
  g.addColorStop(0, COL.furLight);
  g.addColorStop(0.5, COL.fur);
  g.addColorStop(1, COL.furDark);
  return g;
}

function outline(ctx, width = LW) {
  ctx.lineWidth = width;
  ctx.strokeStyle = COL.line;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

// Fill a blob, draw extras clipped inside it (stripes…), then outline it.
function blob(ctx, cx, cy, rx, ry, { tufts = [], rot = 0, fill, inside, line = true } = {}) {
  blobPath(ctx, cx, cy, rx, ry, tufts, rot);
  ctx.fillStyle = fill || furFill(ctx, cx, cy, Math.max(rx, ry));
  ctx.fill();
  if (inside) {
    ctx.save();
    ctx.clip();
    inside();
    ctx.restore();
    blobPath(ctx, cx, cy, rx, ry, tufts, rot);
  }
  if (line) outline(ctx);
}

function stroke(ctx, pts, width, colour) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.lineWidth = width;
  ctx.strokeStyle = colour;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function ellipse(ctx, x, y, rx, ry, fill, withLine = false, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
  if (withLine) outline(ctx, LW * 0.9);
}

// A thick fluffy tail along a curve (p0 → p1 → p2), with darker tabby rings.
function tail(ctx, p0, p1, p2, width = 5.2) {
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.quadraticCurveTo(p1[0], p1[1], p2[0], p2[1]);
  };
  ctx.lineCap = 'round';
  path(); ctx.lineWidth = width + LW * 2; ctx.strokeStyle = COL.line; ctx.stroke();
  path(); ctx.lineWidth = width; ctx.strokeStyle = COL.fur; ctx.stroke();
  path(); ctx.setLineDash([2.2, 3.4]); ctx.lineDashOffset = -3; ctx.lineWidth = width * 0.75; ctx.strokeStyle = COL.stripe;
  ctx.lineCap = 'butt'; ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = 'round';
  ellipse(ctx, p2[0], p2[1], width * 0.42, width * 0.42, COL.furLight);   // light fluffy tip
}

// A short chubby leg from hip to foot, with a cream paw.
function leg(ctx, hip, foot, colour, width = 5.2) {
  stroke(ctx, [hip, foot], width + LW * 2, COL.line);
  stroke(ctx, [hip, foot], width, colour);
  ellipse(ctx, foot[0] + 0.5, foot[1] - 0.9, 2.9, 2, COL.cream, true);   // little cream paw
}

// --- face ----------------------------------------------------------------------

function ear(ctx, bx, by, side, back, twitch) {
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(side * (0.32 + back * 0.55) + twitch * side);
  ctx.beginPath();
  ctx.moveTo(-5.4, 2.2);
  ctx.quadraticCurveTo(-3.6, -5.6, -0.4, -9.6);
  ctx.quadraticCurveTo(0.6, -10.4, 1.4, -9.2);
  ctx.quadraticCurveTo(3.8, -5.2, 5.4, 2.2);
  ctx.closePath();
  ctx.fillStyle = furFill(ctx, 0, -3, 7);
  ctx.fill();
  outline(ctx);
  ctx.beginPath();
  ctx.moveTo(-3.1, 1.2);
  ctx.quadraticCurveTo(-2, -4.2, 0.3, -6.9);
  ctx.quadraticCurveTo(2.3, -4, 3.1, 1.2);
  ctx.closePath();
  ctx.fillStyle = COL.earPink;
  ctx.fill();
  stroke(ctx, [[-0.9, 0.8], [-0.2, -3.6]], 0.55, COL.cream);     // fluffy ear wisps
  stroke(ctx, [[1, 0.8], [0.6, -3]], 0.55, COL.cream);
  ctx.restore();
}

function eye(ctx, x, y, kind, side, look = { x: 0, y: 0 }) {
  ctx.lineWidth = 0.95;
  ctx.strokeStyle = COL.line;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (kind === 'closed') {                    // sleepy curve ‿
    ctx.beginPath(); ctx.moveTo(x - 2.6, y + 0.2); ctx.quadraticCurveTo(x, y + 2.3, x + 2.6, y + 0.2); ctx.stroke();
    return;
  }
  if (kind === 'happy') {                     // smiling eyes ^
    ctx.beginPath(); ctx.moveTo(x - 2.6, y + 1.2); ctx.quadraticCurveTo(x, y - 1.8, x + 2.6, y + 1.2); ctx.stroke();
    return;
  }
  if (kind === 'squeeze') {                   // > <
    const s = side < 0 ? 1 : -1;
    ctx.beginPath(); ctx.moveTo(x - 2 * s, y - 1.7); ctx.lineTo(x + 1.8 * s, y); ctx.lineTo(x - 2 * s, y + 1.7); ctx.stroke();
    return;
  }
  if (kind === 'swirl') {                     // dizzy spirals @ @
    const spin = clock() * 7 * side;
    ctx.beginPath();
    for (let a = 0; a < 4.2 * Math.PI; a += 0.25) {
      const r = 0.2 + a * 0.2;
      const px = x + Math.cos(a + spin) * r, py = y + Math.sin(a + spin) * r;
      if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    return;
  }
  const wide = kind === 'wide';
  const rx = wide ? 3.3 : 2.95, ry = wide ? 3.9 : 3.45;
  const g = ctx.createRadialGradient(x - 0.8, y - 1, 0.3, x, y, ry * 1.1);
  g.addColorStop(0, '#3b2c33');
  g.addColorStop(1, COL.eye);
  ellipse(ctx, x, y, rx, ry, g);
  ellipse(ctx, x - 1 + look.x, y - 1.3 + look.y, wide ? 1 : 1.25, wide ? 1 : 1.25, '#ffffff');   // big sparkle
  ellipse(ctx, x + 1.05 + look.x * 0.5, y + 1.2 + look.y * 0.5, 0.55, 0.55, '#ffffff');          // small sparkle
  if (kind === 'half') {                      // drowsy: eyelid covers the top half
    ctx.save();
    ctx.beginPath(); ctx.ellipse(x, y, rx + 0.2, ry + 0.2, 0, 0, TAU); ctx.clip();
    ctx.fillStyle = COL.fur;
    ctx.fillRect(x - rx - 1, y - ry - 1, rx * 2 + 2, ry + 0.9);
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(x - rx, y - 0.1); ctx.quadraticCurveTo(x, y + 0.6, x + rx, y - 0.1); ctx.stroke();
  }
}

function mouth(ctx, x, y, kind, open) {
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = COL.line;
  ctx.lineCap = 'round';
  if (kind === 'yawn' || kind === 'o' || kind === 'chew') {
    const h = kind === 'yawn' ? 0.6 + open * 3.6 : kind === 'chew' ? 0.5 + open * 1 : 0.5 + open * 1.6;
    const w = kind === 'yawn' ? 1.4 + open * 1.4 : 1.2;
    ellipse(ctx, x, y + 1.3 + h / 2, w, h / 2 + 0.3, COL.mouthIn);
    ctx.beginPath(); ctx.ellipse(x, y + 1.3 + h / 2, w, h / 2 + 0.3, 0, 0, TAU); ctx.stroke();
    if (h > 1.6) ellipse(ctx, x, y + 1.3 + h * 0.85, w * 0.7, h * 0.22, COL.tongue);
    return;
  }
  // default little "w" mouth
  ctx.beginPath();
  ctx.moveTo(x, y + 0.9); ctx.lineTo(x, y + 1.5);
  ctx.moveTo(x, y + 1.5); ctx.quadraticCurveTo(x - 0.8, y + 2.7, x - 2, y + 2);
  ctx.moveTo(x, y + 1.5); ctx.quadraticCurveTo(x + 0.8, y + 2.7, x + 2, y + 2);
  ctx.stroke();
  if (kind === 'smile' || kind === 'tongue') ellipse(ctx, x + 0.2, y + 2.6, 0.9, kind === 'tongue' ? 1.2 : 0.7, COL.tongue);
}

// The head (with ears and face). f = { eyes, look, mouth, open, earBack, twitch, turn, tilt }
function head(ctx, hx, hy, f = {}) {
  const turn = f.turn || 0;
  const now = clock();
  let eyes = f.eyes || 'open';
  // Blink every few seconds when the eyes are open.
  if ((eyes === 'open' || eyes === 'wide') && !f.noBlink && ((now + 1.3) % 3.9) < 0.13) eyes = 'closed';

  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(f.tilt || 0);
  const twitch = f.twitch ?? ((now % 7.3) < 0.18 ? 0.12 : 0);   // ears flick now and then
  ear(ctx, -7.6, -7.6, -1, f.earBack || 0, twitch);
  ear(ctx, 7.6, -7.6, 1, f.earBack || 0, 0);

  const tufts = [
    { a: Math.PI * 0.2, w: 0.5, s: 2.4, n: 3 },     // cheek fluff, right
    { a: Math.PI * 0.8, w: 0.5, s: 2.4, n: 3 },     // cheek fluff, left
    { a: -Math.PI / 2, w: 0.22, s: 1.3, n: 2 },     // tuft on top
  ];
  blob(ctx, 0, 0, 13.6, 11.3, {
    tufts,
    inside: () => {
      for (const [x0, x1, y0, y1] of [[-3, -2.4, -12, -7], [0, 0, -12.5, -6.5], [3, 2.4, -12, -7]]) {
        stroke(ctx, [[x0, y0], [x1, y1]], 1.3, COL.stripe);            // forehead stripes
      }
      for (const s of [-1, 1]) {
        stroke(ctx, [[s * 14, 1], [s * 10, 0.4]], 1.1, COL.stripe);     // cheek stripes
        stroke(ctx, [[s * 13.8, 3.6], [s * 10.3, 3]], 1.1, COL.stripe);
      }
      ellipse(ctx, turn * 1.4, 5, 7.2, 4.6, COL.cream);                 // muzzle
    },
  });

  const fx = turn * 1.6;                              // face slides a little towards where it's looking
  const look = f.look || { x: turn * 0.5, y: 0 };
  ellipse(ctx, fx - 8.4, 4.2, 2.4, 1.3, COL.blush);  // rosy cheeks
  ellipse(ctx, fx + 8.4, 4.2, 2.4, 1.3, COL.blush);
  eye(ctx, fx - 5.4, 0.3, eyes, -1, look);
  eye(ctx, fx + 5.4, 0.3, eyes, 1, look);

  // nose
  ctx.beginPath();
  ctx.moveTo(fx - 1.4, 2);
  ctx.lineTo(fx + 1.4, 2);
  ctx.quadraticCurveTo(fx + 1.2, 2.9, fx, 3.6);
  ctx.quadraticCurveTo(fx - 1.2, 2.9, fx - 1.4, 2);
  ctx.fillStyle = COL.nose;
  ctx.fill();
  mouth(ctx, fx, 2.7, f.mouth || 'none', f.open || 0);

  // whiskers
  for (const s of [-1, 1]) {
    stroke(ctx, [[fx + s * 9.5, 4], [fx + s * 16.5, 2.6]], 0.45, 'rgba(107,59,31,0.45)');
    stroke(ctx, [[fx + s * 9.5, 5.2], [fx + s * 16.5, 5.6]], 0.45, 'rgba(107,59,31,0.45)');
  }
  ctx.restore();
}

// --- whole-body poses ----------------------------------------------------------

// Sitting, facing you. o = { breathe, headDy, headDx, tilt, face, paws:[liftL, liftR], groomPaw,
//                            tailSway, tailUp, hop, squash }
function sitting(ctx, o = {}) {
  ctx.save();
  if (o.hop) ctx.translate(0, -o.hop);
  if (o.squash) {
    ctx.translate(32, 60);
    ctx.scale(1 + o.squash * 0.14, 1 - o.squash * 0.16);
    ctx.translate(-32, -60);
  }
  const b = o.breathe || 0;
  const sway = o.tailSway || 0;
  const up = o.tailUp || 0;

  tail(ctx, [40, 57], [57, 60 - up * 4], [54 + sway * 3, 46 - up * 9]);
  blob(ctx, 23.6, 55.2, 7, 5.2);                         // back legs (haunches)
  blob(ctx, 40.4, 55.2, 7, 5.2);

  blob(ctx, 32, 48.6 - b * 0.4, 12.6, 11 * (1 + b * 0.025), {
    tufts: [{ a: Math.PI, w: 0.45, s: 1.3, n: 2 }, { a: 0, w: 0.45, s: 1.3, n: 2 }],
    inside: () => {
      for (const s of [-1, 1]) {
        stroke(ctx, [[32 + s * 13, 43.5], [32 + s * 8.8, 45.5]], 1.4, COL.stripe);
        stroke(ctx, [[32 + s * 13.2, 48], [32 + s * 9.2, 50]], 1.4, COL.stripe);
      }
    },
  });
  // fluffy cream chest
  blobPath(ctx, 32, 49.8 - b * 0.4, 7.2, 8.4, [{ a: -Math.PI / 2, w: 1.25, s: 1.8, n: 5 }]);
  ctx.fillStyle = COL.cream;
  ctx.fill();

  const lift = o.paws || [0, 0];
  if (!o.groomPaw) ellipse(ctx, 36.4, 58.6 - lift[1], 3.4, 2.5, COL.cream, true);
  ellipse(ctx, 27.6, 58.6 - lift[0], 3.4, 2.5, COL.cream, true);
  for (const [px, l] of [[27.6, lift[0]], [36.4, o.groomPaw ? -99 : lift[1]]]) {
    if (l < -50) continue;
    stroke(ctx, [[px - 0.9, 59.6 - l], [px - 0.9, 60.6 - l]], 0.45, COL.line);   // little toes
    stroke(ctx, [[px + 0.9, 59.6 - l], [px + 0.9, 60.6 - l]], 0.45, COL.line);
  }

  if (o.arms) {                                          // both front legs reaching up (catching a bird)
    leg(ctx, [27, 45], o.arms[0], COL.fur, 4.6);
    leg(ctx, [37, 45], o.arms[1], COL.fur, 4.6);
  }
  head(ctx, 32 + (o.headDx || 0), 30.5 + (o.headDy || 0) - b * 0.5, { tilt: o.tilt || 0, ...(o.face || {}) });
  if (o.groomPaw) ellipse(ctx, o.groomPaw[0], o.groomPaw[1], 3.2, 2.6, COL.cream, true);   // paw up at the mouth
  if (o.arms) for (const [x, y] of o.arms) ellipse(ctx, x + 0.5, y - 0.9, 3.1, 2.4, COL.cream, true);   // paws in front of the head
  ctx.restore();
}

// Standing / walking, side view facing right.
// o = { phase (radians), amp, gallop, bob, rot, headDy, headDx, face, tailSway, tailUp, frontReach, liftAll,
//       swipe (0..1: near front paw reaches out and up, for batting the yarn) }
function side(ctx, o = {}) {
  const p = o.phase || 0;
  const amp = o.amp || 0;
  const rot = o.rot || 0;
  const bob = o.bob || 0;
  const reach = o.frontReach || 0;
  const hipY = (x) => 53 + bob + (x - 30) * Math.sin(rot);

  tail(ctx, [17, 48 + bob], [5, 47 + bob], [7 + (o.tailSway || 0) * 3, 33 + bob - (o.tailUp || 0) * 4]);

  // Legs: diagonal pairs move together when walking; front/back pairs when galloping.
  const legs = [
    { x: 20, ph: o.gallop ? p + Math.PI : p + Math.PI, far: true },
    { x: 24, ph: o.gallop ? p + Math.PI + 0.5 : p, far: false },
    { x: 37, ph: o.gallop ? p : p, far: true },
    { x: 41, ph: o.gallop ? p + 0.5 : p + Math.PI, far: false },
  ];
  for (const l of legs) {
    const front = l.x > 30;
    const swing = Math.sin(l.ph) * amp + (front ? reach : 0);
    let lift = Math.max(0, Math.cos(l.ph)) * amp * 0.4 + (o.liftAll || 0);
    let reachOut = swing * 0.8;
    if (l.x === 41 && o.swipe) { reachOut += o.swipe * 9; lift += o.swipe * 7; }   // paw swipe!
    leg(ctx, [l.x, hipY(l.x) - 2], [l.x + reachOut, 59.6 - lift], l.far ? COL.furDark : COL.fur);
  }

  blob(ctx, 30, 48.5 + bob, 15.2, 9, {
    rot,
    tufts: [
      { a: Math.PI / 2, w: 0.9, s: 1.4, n: 4 },     // belly fluff
      { a: Math.PI, w: 0.5, s: 1.5, n: 2 },         // fluffy bottom
      { a: 0.25, w: 0.45, s: 1.6, n: 3 },           // chest fluff
    ],
    inside: () => {
      for (const x of [23, 28.5, 34]) stroke(ctx, [[x, 38.5 + bob], [x + 1, 45 + bob]], 1.6, COL.stripe);   // back stripes
      ellipse(ctx, 32, 56.5 + bob, 10, 3.6, COL.cream);                                                       // tummy
    },
  });

  head(ctx, 43 + (o.headDx || 0), 35 + bob * 1.2 + (o.headDy || 0), { turn: 0.7, ...(o.face || {}) });
}

// Curled up asleep. Head on the LEFT (cat.js puts the "zzz" there).
function sleeping(ctx, t) {
  const b = Math.sin((t / 3.4) * TAU);                    // slow breathing
  blob(ctx, 36, 51.5 - b * 0.3, 17.5, 9.2 * (1 + b * 0.035), {
    tufts: [{ a: -Math.PI / 2, w: 1.3, s: 1.2, n: 5 }],
    inside: () => {
      for (const x of [33, 39, 45]) stroke(ctx, [[x, 41.5], [x + 1.5, 47]], 1.6, COL.stripe);
    },
  });
  head(ctx, 18.5, 47.8 + b * 0.25, { eyes: 'closed', tilt: -0.14, earBack: 0.15, twitch: 0, noBlink: true });
  ellipse(ctx, 25, 57.5, 3.3, 2.2, COL.cream, true);      // paw tucked under the chin
  tail(ctx, [50, 54], [55, 61.5], [30, 60.5], 4.8);         // tail wrapped around the front
}

// Dangling from your mouse (held by the scruff), or falling with legs spread.
function dangling(ctx, t, falling) {
  if (falling) {
    // Wind streaks rushing up past the kitten as it drops.
    for (const [x, ph] of [[12, 0], [52, 0.35], [18, 0.7], [46, 0.15]]) {
      const y = 50 - ((t * 70 + ph * 34) % 34);
      stroke(ctx, [[x, y], [x, y + 7]], 1, 'rgba(107, 59, 31, 0.35)');
    }
  }
  ctx.save();
  const swing = falling ? Math.sin(t * 9) * 0.13 : Math.sin(t * 3.2) * 0.09;   // falling: flail and wobble
  ctx.translate(32, falling ? 40 : 18);
  ctx.rotate(swing);
  ctx.translate(-32, falling ? -40 : -18);
  const kick = Math.sin(t * (falling ? 16 : 2.6));
  if (falling) {
    tail(ctx, [32, 54], [41, 50], [45, 39 + kick]);
    leg(ctx, [27, 51], [18, 57 + kick * 0.6], COL.fur);
    leg(ctx, [37, 51], [46, 57 - kick * 0.6], COL.fur);
    leg(ctx, [27, 40], [16, 35 - kick * 0.6], COL.fur);
    leg(ctx, [37, 40], [48, 35 + kick * 0.6], COL.fur);
  } else {
    tail(ctx, [32, 54], [37, 60], [33 + kick * 2, 63]);
    leg(ctx, [28, 51], [27 + kick * 0.6, 61], COL.fur);
    leg(ctx, [36, 51], [37 - kick * 0.6, 61], COL.fur);
  }
  const poof = falling ? 2.6 : 1.3;          // fur puffs up in fright when falling
  blob(ctx, 32, 44, 10.6, 12.4, {
    tufts: [{ a: Math.PI, w: 0.6, s: poof, n: 3 }, { a: 0, w: 0.6, s: poof, n: 3 }],
    inside: () => {
      ellipse(ctx, 32, 46, 5.6, 9, COL.cream);
      for (const s of [-1, 1]) stroke(ctx, [[32 + s * 10, 42], [32 + s * 6.8, 43.5]], 1.4, COL.stripe);
    },
  });
  if (!falling) {
    ellipse(ctx, 27.6, 41.5, 3, 2.4, COL.cream, true);   // front paws held up
    ellipse(ctx, 36.4, 41.5, 3, 2.4, COL.cream, true);
  }
  head(ctx, 32, 24.5, falling
    ? { eyes: 'wide', mouth: 'o', open: 0.6, earBack: 0.7, noBlink: true }
    : { eyes: 'open', look: { x: 0, y: 0.9 }, mouth: 'none', earBack: 0.25 });
  ctx.restore();
}

// --- little effects -------------------------------------------------------------

// Dust puffs kicked up on landing. p: 0 → 1 over the landing, power: how big the drop was.
function dust(ctx, p, power) {
  const a = (1 - p) * 0.85;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const x = 32 + s * (10 + p * (12 + i * 7));
      const y = 59.2 - p * (2 + i * 2.5);
      const r = 1.6 + i + p * 3.2 * (0.6 + power);
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.8, 0, 0, TAU);
      ctx.fillStyle = `rgba(238, 228, 212, ${a})`;
      ctx.fill();
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = `rgba(107, 59, 31, ${a * 0.5})`;
      ctx.stroke();
    }
  }
}

// A little 5-pointed star.
function star(ctx, x, y, r, fill) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineJoin = 'round';
  outline(ctx, 0.6);
}

// Water drops flying off a kitten shaking itself dry.
function droplets(ctx, p) {
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * 0.95 + (i / 8) * Math.PI * 0.9 + Math.sin(i * 7) * 0.15;
    const d = 15 + p * (16 + (i % 3) * 5);
    const x = 32 + Math.cos(a) * d * 1.3;
    const y = 40 + Math.sin(a) * d + p * p * 8;
    ctx.save();
    ctx.globalAlpha = 1 - p;
    ellipse(ctx, x, y, 1.1, 1.5, '#9fd8f2', false, a + Math.PI / 2);
    ctx.restore();
  }
}

// --- the poses, by animation name ------------------------------------------------
// Each gets t = seconds since the pose started, and o = extra settings from cat.js
// (e.g. how far the kitten fell). One-shot poses list their length in ONE_SHOT_LEN.

const ONE_SHOT_LEN = {
  stretch: 2.2, yawn: 1.7, wake: 1.0, happy: 1.0, land: 0.6, meow: 0.8,
  dizzy: 2.2, hopin: 0.55, hopout: 0.55, shake: 1.2, bat: 0.75, reach: 1.5,
};
// Calm poses hardly move, so they're redrawn 15 times a second instead of 30 (saves CPU).
const CALM = new Set(['idle', 'sit', 'look', 'sleep', 'eat']);

const POSES = {
  idle: (ctx, t) => sitting(ctx, {
    breathe: Math.sin((t / 2.6) * TAU),
    tailSway: Math.sin(t * 1.6),
    tilt: Math.sin(t * 0.7) * 0.05,
  }),
  look: (ctx, t) => sitting(ctx, {
    breathe: Math.sin((t / 2.6) * TAU),
    tailSway: Math.sin(t * 3.2),
    headDy: -1.2,
    tilt: Math.sin(t * 1.4) * 0.12,                       // curious head tilt
    face: { look: { x: 0, y: -1.1 } },
  }),
  sit: (ctx, t) => sitting(ctx, {
    breathe: Math.sin((t / 3.2) * TAU),
    tailSway: Math.sin(t * 0.8) * 0.6,
    face: { eyes: (t % 5) > 3.6 ? 'happy' : 'open' },     // slow, contented blinks
  }),
  groom: (ctx, t) => {
    const lick = Math.sin(t * 9);
    sitting(ctx, {
      breathe: 0,
      tilt: 0.16,
      headDx: 0.8,
      headDy: 1.2,
      groomPaw: [37.5, 39.2 + lick * 1.2],
      face: { eyes: 'closed', mouth: lick > 0 ? 'tongue' : 'none' },
      tailSway: Math.sin(t * 1.2) * 0.5,
    });
  },
  yawn: (ctx, t) => {
    const k = hump(t / 1.7);
    sitting(ctx, {
      headDy: -k * 1.6,
      tilt: -k * 0.12,
      face: { eyes: k > 0.3 ? 'squeeze' : 'open', mouth: 'yawn', open: smooth(k * 1.3), earBack: k * 0.5, noBlink: true },
      tailSway: Math.sin(t * 2),
    });
  },
  meow: (ctx, t) => {
    const k = hump(t / 0.8);
    sitting(ctx, {
      headDy: -k * 1.2,
      tilt: -k * 0.08,
      face: { eyes: k > 0.5 ? 'happy' : 'open', mouth: 'o', open: k, noBlink: true },
      tailUp: k * 0.6,
    });
  },
  wake: (ctx, t) => {
    const p = t / 1.0;
    const eyes = p < 0.35 ? 'closed' : p < 0.7 ? 'half' : 'open';
    sitting(ctx, {
      tilt: p > 0.7 ? Math.sin(t * 22) * 0.06 * (1 - p) * 3 : 0,    // little head shake
      face: { eyes, noBlink: true },
      headDy: (1 - smooth(p)) * 2,
    });
  },
  happy: (ctx, t) => {
    const p = t / 1.0;
    const hop = p < 0.55 ? hump(p / 0.55) * 9 : hump((p - 0.55) / 0.45) * 3.5;
    sitting(ctx, {
      hop,
      squash: p > 0.5 && p < 0.6 ? 0.6 : 0,
      paws: [hop * 0.25, hop * 0.25],
      face: { eyes: 'happy', mouth: 'smile' },
      tailUp: 1,
      tailSway: Math.sin(t * 14) * 0.6,
    });
  },
  land: (ctx, t, o) => {
    // Squish on impact, then a springy bounce; bigger drops squish more and kick up more dust.
    const power = clamp01((o.height || 100) / 600);
    const p = clamp01(t / 0.6);
    const squash = Math.pow(1 - p, 2) * Math.cos(p * Math.PI * 3) * (0.6 + power * 0.9);
    dust(ctx, p, power);
    sitting(ctx, {
      squash,
      face: { eyes: p < 0.5 ? 'squeeze' : 'open', mouth: p < 0.5 ? 'o' : 'none', open: 0.3, noBlink: true },
      tailUp: (1 - p) * 0.8,
    });
  },
  dizzy: (ctx, t) => {
    // After a really big drop: wobbly head, swirly eyes, stars going round.
    sitting(ctx, {
      tilt: Math.sin(t * 5) * 0.13,
      headDx: Math.sin(t * 5) * 0.8,
      face: { eyes: 'swirl', mouth: 'o', open: 0.2, noBlink: true },
      tailSway: Math.sin(t * 3),
    });
    for (let i = 0; i < 3; i++) {
      const a = t * 4 + (i * TAU) / 3;
      star(ctx, 32 + Math.cos(a) * 11, 15 + Math.sin(a) * 2.8, 1.9, '#ffd84a');
    }
  },
  eatside: (ctx, t) => side(ctx, {
    // Head down in the bowl (the bowl is just in front of the kitten), munching happily.
    bob: 1,
    headDy: 11,
    headDx: 4,
    tailSway: Math.sin(t * 2.2),
    face: { eyes: 'happy', mouth: 'chew', open: (Math.sin(t * 11) + 1) / 2, noBlink: true },
  }),
  bat: (ctx, t) => {
    // Crouch, wiggle the bottom… then SWIPE at the yarn.
    const p = t / 0.75;
    const crouch = p < 0.5;
    side(ctx, {
      bob: crouch ? 2 : 2 * (1 - smooth((p - 0.5) / 0.2)),
      rot: crouch ? -0.07 + Math.sin(t * 34) * 0.03 : 0,
      tailSway: Math.sin(t * (crouch ? 20 : 6)),
      tailUp: 0.4,
      swipe: crouch ? 0 : hump((p - 0.5) / 0.5),
      face: { eyes: crouch ? 'wide' : 'happy', mouth: crouch ? 'none' : 'smile', noBlink: true, earBack: crouch ? 0.3 : 0 },
    });
  },
  hopin: (ctx, t) => {
    // Hop up and drop into the bath.
    const p = clamp01(t / 0.55);
    drawTubBack(ctx, t);
    ctx.save();
    if (p > 0.45) { ctx.beginPath(); ctx.rect(0, -20, 64, 69); ctx.clip(); }   // inside the tub: hide what's under the water
    ctx.translate(0, -15 * hump(p) + 14 * smooth(p));
    side(ctx, { rot: -0.2 + p * 0.3, liftAll: 2, tailUp: 0.8, face: { eyes: 'wide', noBlink: true } });
    ctx.restore();
    drawTubFront(ctx, t, true);
  },
  bath: (ctx, t) => {
    // Only the head and front paws peek out of the bubbles.
    tail(ctx, [46, 46], [57, 44], [56 + Math.sin(t * 1.5) * 2, 34], 4.6);
    drawTubBack(ctx, t);
    const bob = Math.sin(t * 2) * 0.6;
    head(ctx, 31, 35 + bob, { eyes: (t % 4) > 2.8 ? 'happy' : 'open', mouth: 'smile', tilt: Math.sin(t * 1.3) * 0.08 });
    for (const [x, y, r] of [[27.5, 24.2, 2.3], [31.5, 23, 2.9], [35.2, 24.4, 2.1]]) {   // bubble hat
      ellipse(ctx, x, y + bob, r, r * 0.85, PCOL.foam);
      ctx.beginPath(); ctx.ellipse(x, y + bob, r, r * 0.85, 0, 0, TAU);
      ctx.lineWidth = 0.6; ctx.strokeStyle = PCOL.foamLine; ctx.stroke();
    }
    ellipse(ctx, 23.5, 44.2, 3, 2.3, COL.cream, true);       // paws on the edge of the tub
    ellipse(ctx, 39.5, 44.2, 3, 2.3, COL.cream, true);
    drawTubFront(ctx, t, true);
    for (let i = 0; i < 5; i++) {                             // bubbles floating up
      const q = (t * 0.45 + i * 0.21) % 1;
      const x = 16 + i * 8 + Math.sin(t * 2 + i) * 1.6;
      ctx.save();
      ctx.globalAlpha = 1 - q;
      ctx.beginPath(); ctx.arc(x, 40 - q * 32, 1 + (i % 2) * 0.7, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
      ctx.lineWidth = 0.5; ctx.strokeStyle = PCOL.foamLine; ctx.stroke();
      ctx.restore();
    }
  },
  hopout: (ctx, t) => {
    // Jump out; the tub fades away behind.
    const p = clamp01(t / 0.55);
    ctx.save();
    ctx.globalAlpha = 1 - p;
    drawTubBack(ctx, t);
    ctx.restore();
    ctx.save();
    if (p < 0.4) { ctx.beginPath(); ctx.rect(0, -20, 64, 69); ctx.clip(); }   // still inside the tub
    ctx.translate(0, 12 * (1 - smooth(p)) - 14 * hump(p));
    side(ctx, { rot: 0.15 - p * 0.15, liftAll: 2 * (1 - p), tailUp: 0.8, face: { eyes: 'squeeze', noBlink: true } });
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 1 - p;
    drawTubFront(ctx, t, false);
    ctx.restore();
  },
  reach: (ctx, t) => {
    // Trying to catch the sparrow: crouch and wiggle… LEAP with both paws up, clap… missed!
    const p = clamp01(t / 1.5);
    if (p < 0.4) {
      ctx.save();
      ctx.translate(32, 60); ctx.rotate(Math.sin(t * 32) * 0.04); ctx.translate(-32, -60);
      sitting(ctx, { squash: 0.35, face: { eyes: 'wide', look: { x: 0, y: -1 }, earBack: 0.25, noBlink: true }, tailSway: Math.sin(t * 22) });
      ctx.restore();
    } else if (p < 0.8) {
      const q = (p - 0.4) / 0.4;
      const hop = hump(q) * 14;
      const clap = 7 * (1 - hump(q));                       // paws come together at the top
      sitting(ctx, {
        hop, squash: -0.25 * hump(q), tailUp: 1,
        arms: [[24 + clap * 0.2 + 4 * hump(q), 22 - 8 * hump(q)], [40 - clap * 0.2 - 4 * hump(q), 22 - 8 * hump(q)]],
        face: { eyes: 'wide', mouth: 'o', open: 0.6, look: { x: 0, y: -1.2 }, noBlink: true },
      });
    } else {
      sitting(ctx, { squash: 0.3 * (1 - (p - 0.8) / 0.2), face: { eyes: 'squeeze', mouth: 'o', open: 0.3, noBlink: true } });
    }
  },
  shake: (ctx, t) => {
    // Shake, shake, shake! Water drops fly off.
    const p = clamp01(t / 1.2);
    ctx.save();
    ctx.translate(32, 60);
    ctx.rotate(Math.sin(t * 30) * 0.14 * (1 - p));
    ctx.translate(-32, -60);
    sitting(ctx, { face: { eyes: 'squeeze', mouth: 'none', earBack: 0.4 * (1 - p), noBlink: true }, tailSway: Math.sin(t * 30) });
    ctx.restore();
    droplets(ctx, p);
  },
  eat: (ctx, t) => sitting(ctx, {
    headDy: 5,
    tilt: 0.05,
    face: { eyes: 'happy', mouth: 'chew', open: (Math.sin(t * 10) + 1) / 2 },
    tailSway: Math.sin(t * 2.5),
  }),
  walk: (ctx, t) => {
    const ph = (t / 0.7) * TAU;
    side(ctx, { phase: ph, amp: 3.4, bob: -Math.abs(Math.sin(ph)) * 0.7, tailSway: Math.sin(ph * 0.5), headDy: Math.sin(ph * 2) * 0.3 });
  },
  run: (ctx, t) => {
    const ph = (t / 0.4) * TAU;
    side(ctx, {
      phase: ph, amp: 5.4, gallop: true, bob: -Math.abs(Math.sin(ph)) * 1.6, rot: Math.sin(ph) * 0.07,
      tailSway: Math.sin(ph) * 0.5, tailUp: 0.6, face: { earBack: 0.35 },
    });
  },
  stretch: (ctx, t) => {
    const k = hump(t / 2.2);
    const kk = smooth(k * 1.4);
    side(ctx, {
      rot: kk * 0.22, frontReach: kk * 6, headDy: kk * 4.5, headDx: kk * 2.5, tailUp: kk * 1.3,
      face: { eyes: kk > 0.4 ? 'closed' : 'open', mouth: kk > 0.6 ? 'yawn' : 'none', open: kk * 0.6, noBlink: true },
    });
  },
  jump: (ctx, t) => side(ctx, { rot: -0.25, liftAll: 3, frontReach: 3, tailUp: 0.8, face: { eyes: 'wide', noBlink: true } }),
  sleep: (ctx, t) => sleeping(ctx, t),
  carried: (ctx, t) => dangling(ctx, t, false),
  fall: (ctx, t) => dangling(ctx, t, true),
};

// --- the player: same job as the old sprite-sheet Animator ----------------------
class KittenAnimator {
  constructor() {
    this.name = null;
    this.t = 0;              // seconds since this pose started
    this.done = false;       // a one-shot pose (yawn, stretch…) has finished
    this.sinceDraw = 1;
  }

  play(name, { restart = false, params = {} } = {}) {
    if (this.name === name && !restart) return;
    if (!POSES[name]) { console.warn('unknown pose', name); return; }
    this.name = name;
    this.params = params;    // extra settings for the pose, e.g. { height } for 'land'
    this.t = 0;
    this.done = false;
    this.sinceDraw = 1;
  }

  // Advance by dt seconds. Returns true when it's time to repaint
  // (30 times a second when moving, 15 when calm: smooth, but light on the CPU).
  update(dt) {
    if (!this.name) return false;
    this.t += dt;
    const len = ONE_SHOT_LEN[this.name];
    if (len && this.t >= len) { this.t = len; this.done = true; }
    this.sinceDraw += dt;
    const fps = CALM.has(this.name) ? 15 : 30;
    if (this.sinceDraw >= 1 / fps - 0.002) { this.sinceDraw = 0; return true; }
    return false;
  }

  // Draw into the box (x, y, size) on the canvas; flip = face left.
  draw(ctx, x, y, size, flip) {
    if (!this.name) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / KIT.cell, size / KIT.cell);
    if (flip) { ctx.translate(KIT.cell, 0); ctx.scale(-1, 1); }
    POSES[this.name](ctx, this.t, this.params || {});
    ctx.restore();
  }
}
