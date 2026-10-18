/*
  src/renderer/props.js  —  the play things: food bowl, fish snack, bathtub, yarn ball,
                             plus the cat tree and the sparrow
  -------------------------------------------------------------------------
  Drawn in the same soft cartoon style as the kitten (it uses the helpers and
  colours from kitten.js, so load kitten.js first). Like the kitten, each one
  is drawn in a 64 x 64 box with the floor at y = 60, centred on x = 32.

  Used in two places:
    * prop.js  — the little window that holds the bowl / fish / tub on your desktop
    * kitten.js — the "bath" pose draws the tub around the kitten
*/

const PCOL = {
  bowl: '#8fd0e8', bowlDark: '#5aa9c8', bowlInside: '#3f86a6',
  kibble: '#b8743f', kibbleDark: '#8e532a', kibbleLight: '#d79a5e',
  fish: '#ffb347', fishDark: '#f08a24', fishBelly: '#ffe2b0',
  tub: '#ffffff', tubShade: '#d9e6ee', water: '#a9dcf0', foam: '#ffffff', foamLine: '#9fcbe0',
  gold: '#e3b958', duck: '#ffd84a', beak: '#ff9a3c',
};

// --- food bowl ---------------------------------------------------------------
// level: 1 = full, 0 = empty
const KIBBLE = [[-6, 0], [-3, -1.2], [0, 0.2], [3, -1], [6, 0.3], [-4.5, 1.2], [-1.5, 1.4], [1.5, 1.1], [4.5, 1.3], [-1, -2], [2, -2.1]];
function drawBowl(ctx, level = 1) {
  ellipse(ctx, 32, 50, 12.5, 3.6, PCOL.bowlInside);                 // the opening
  if (level > 0.02) {                                                // heap of kibble
    const top = 50 - level * 3;
    ellipse(ctx, 32, top + 1, 10.5, 2 + level * 1.8, PCOL.kibble);
    KIBBLE.slice(0, Math.ceil(KIBBLE.length * level)).forEach(([dx, dy], i) => {
      ellipse(ctx, 32 + dx, top + dy, 1.5, 1.1, i % 2 ? PCOL.kibbleDark : PCOL.kibbleLight);
    });
  }
  ctx.beginPath();                                                   // the bowl itself
  ctx.moveTo(19.5, 50);
  ctx.quadraticCurveTo(20.5, 59.5, 25, 59.6);
  ctx.lineTo(39, 59.6);
  ctx.quadraticCurveTo(43.5, 59.5, 44.5, 50);
  ctx.quadraticCurveTo(32, 54.6, 19.5, 50);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 50, 0, 60);
  g.addColorStop(0, '#c4ecf8');
  g.addColorStop(1, PCOL.bowlDark);
  ctx.fillStyle = g;
  ctx.fill();
  outline(ctx);
  ctx.beginPath();                                                   // rim
  ctx.ellipse(32, 50, 12.5, 3.6, 0, Math.PI, Math.PI * 2);
  outline(ctx);
  ellipse(ctx, 32, 56.2, 1.7, 1.3, COL.cream);                       // paw-print decoration
  for (const [dx, dy] of [[-1.8, -1.6], [0, -2.3], [1.8, -1.6]]) ellipse(ctx, 32 + dx, 56.2 + dy, 0.65, 0.65, COL.cream);
}

// --- fish snack --------------------------------------------------------------
// bitten: 0 = whole fish, 1 = all gone (eaten from the head end)
function drawFish(ctx, bitten = 0) {
  if (bitten >= 0.98) return;
  ctx.save();
  const cut = 41 - bitten * 18;                                      // everything right of this is eaten
  ctx.beginPath();
  ctx.rect(0, 0, cut, 64);
  for (const y of [52, 55.5, 59]) ctx.arc(cut, y, bitten > 0 ? 2.2 : 0.01, 0, Math.PI * 2);   // bite marks
  ctx.clip('evenodd');
  ctx.beginPath();                                                   // tail
  ctx.moveTo(25.5, 56);
  ctx.lineTo(20, 51.5);
  ctx.quadraticCurveTo(21.5, 56, 20, 60.2);
  ctx.closePath();
  ctx.fillStyle = PCOL.fishDark;
  ctx.fill();
  outline(ctx);
  ellipse(ctx, 32.5, 56, 8.6, 4, PCOL.fish);                          // body
  ctx.beginPath(); ctx.ellipse(32.5, 56, 8.6, 4, 0, 0, Math.PI * 2); outline(ctx);
  ellipse(ctx, 33.5, 57.6, 5.5, 1.6, PCOL.fishBelly);
  for (const x of [28, 31]) stroke(ctx, [[x, 53], [x - 0.8, 55.5]], 0.9, PCOL.fishDark);   // scales
  ellipse(ctx, 37.6, 55, 1.15, 1.15, COL.eye);                        // eye
  ellipse(ctx, 37.3, 54.6, 0.4, 0.4, '#ffffff');
  stroke(ctx, [[39.5, 57], [40.3, 57.4]], 0.6, COL.line);             // little smile
  ctx.restore();
}

// --- bathtub -----------------------------------------------------------------
// Drawn in two halves so a kitten can sit "inside": back half, (kitten), front half.
const FOAM = [[15, 42.5, 3], [19.5, 41, 3.6], [24.5, 42, 3.1], [29.5, 40.8, 3.4], [34.5, 41.8, 3.2], [39.5, 40.9, 3.5], [44.5, 42.1, 3.1], [49, 42.6, 2.8]];

function drawTubBack(ctx, t = 0) {
  ellipse(ctx, 32, 44, 20, 4.6, PCOL.water);                          // water surface
  for (const [x, y, r] of FOAM) {                                     // foam heaped above the rim
    const wob = Math.sin(t * 2 + x) * 0.3;
    ellipse(ctx, x, y + wob, r, r * 0.85, PCOL.foam);
    ctx.beginPath(); ctx.ellipse(x, y + wob, r, r * 0.85, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.lineWidth = 0.6; ctx.strokeStyle = PCOL.foamLine; ctx.stroke();
  }
}

function drawTubFront(ctx, t = 0, withDuck = false) {
  for (const x of [17, 47]) ellipse(ctx, x, 58.6, 2.3, 1.9, PCOL.gold, true);   // little feet
  ctx.beginPath();
  ctx.moveTo(12, 44);
  ctx.quadraticCurveTo(12.5, 57, 20, 57.4);
  ctx.lineTo(44, 57.4);
  ctx.quadraticCurveTo(51.5, 57, 52, 44);
  ctx.quadraticCurveTo(32, 49.8, 12, 44);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 44, 0, 58);
  g.addColorStop(0, PCOL.tub);
  g.addColorStop(1, PCOL.tubShade);
  ctx.fillStyle = g;
  ctx.fill();
  outline(ctx);
  stroke(ctx, [[16, 49], [17.5, 53.5]], 1, 'rgba(255,255,255,0.9)');  // shine
  for (const [x, y, r] of [[16, 45.6, 2.2], [22, 46.6, 2.6], [41, 46.7, 2.5], [47.5, 45.7, 2.1]]) {   // foam spilling over
    const wob = Math.sin(t * 2.4 + x) * 0.25;
    ellipse(ctx, x, y + wob, r, r * 0.8, PCOL.foam);
    ctx.beginPath(); ctx.ellipse(x, y + wob, r, r * 0.8, 0, 0.1, Math.PI - 0.1);
    ctx.lineWidth = 0.6; ctx.strokeStyle = PCOL.foamLine; ctx.stroke();
  }
  if (withDuck) {                                                      // rubber duck bobbing along
    const bob = Math.sin(t * 3) * 0.6;
    const x = 46 + Math.sin(t * 0.8) * 2;
    ellipse(ctx, x, 42 + bob, 3.4, 2.2, PCOL.duck, true);
    ellipse(ctx, x + 2, 39.4 + bob, 1.9, 1.9, PCOL.duck, true);
    ellipse(ctx, x + 3.9, 39.8 + bob, 1, 0.55, PCOL.beak);
    ellipse(ctx, x + 2.5, 38.9 + bob, 0.35, 0.35, COL.eye);
  }
}

// --- yarn ball -----------------------------------------------------------------
// A woolly ball (radius 7, sitting on the floor) with a loose thread trailing behind.
// angle: how far it has rolled (radians), so the wound threads turn as it rolls.
const YARN = { r: 7, cy: 53, col: '#ff8fae', dark: '#e9668c', light: '#ffc3d4' };
function drawYarn(ctx, angle = 0) {
  const { r, cy } = YARN;
  ctx.beginPath();                                                     // loose thread on the floor
  ctx.moveTo(32 - r * 0.6, cy + r * 0.75);
  ctx.bezierCurveTo(22, 61, 18, 57, 12, 59.5);
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = YARN.dark;
  ctx.lineCap = 'round';
  ctx.stroke();
  const g = ctx.createRadialGradient(32 - 2.5, cy - 2.5, 0.5, 32, cy, r * 1.2);
  g.addColorStop(0, YARN.light);
  g.addColorStop(0.6, YARN.col);
  g.addColorStop(1, YARN.dark);
  ellipse(ctx, 32, cy, r, r, g);
  ctx.save();                                                          // wound threads, turning with the roll
  ctx.beginPath(); ctx.arc(32, cy, r - 0.3, 0, Math.PI * 2); ctx.clip();
  ctx.translate(32, cy);
  ctx.rotate(angle);
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = YARN.dark;
  for (let i = -2; i <= 2; i++) {                                      // one set of threads…
    ctx.beginPath(); ctx.ellipse(i * 2.6, 0, 2.2, r * 1.1, 0.5, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  for (let i = -1; i <= 1; i++) {                                      // …and a crossing set
    ctx.beginPath(); ctx.ellipse(0, i * 3, r * 1.1, 1.8, -0.4, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
  ctx.beginPath(); ctx.arc(32, cy, r, 0, Math.PI * 2); outline(ctx);
  ellipse(ctx, 29.5, cy - 3, 1.6, 1, 'rgba(255,255,255,0.7)', false, -0.6);   // shine
}

// --- cat tree ------------------------------------------------------------------
// Drawn in a 100 x 160 box with the floor at y = 156 (and shown 1.35x bigger
// than the kitten's units — TREE.zoom in main.js). The platforms where the
// kitten can sit (main.js has the same numbers in TREE.perches):
//   top (52, 34) · left (22, 64) · bowl bed (56, 95) · low dish (80, 126)
const WOOD = {
  light: '#e8b67c', mid: '#c98d4f', dark: '#96612f', ring: 'rgba(150, 97, 47, 0.35)',
  rope: '#dcc79c', ropeLine: 'rgba(120, 90, 50, 0.45)', hole: '#5b3a1f', pom: '#e2cfae',
};

// A thick wooden branch through the points (smooth curve), with a highlight.
function branch(ctx, pts, width) {
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], i === pts.length - 2 ? pts[i + 1][0] : mx, i === pts.length - 2 ? pts[i + 1][1] : my);
    }
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  path(); ctx.lineWidth = width + LW * 2; ctx.strokeStyle = COL.line; ctx.stroke();
  path(); ctx.lineWidth = width; ctx.strokeStyle = WOOD.mid; ctx.stroke();
  ctx.save(); ctx.translate(-width * 0.18, 0);
  path(); ctx.lineWidth = width * 0.3; ctx.strokeStyle = 'rgba(255, 220, 170, 0.55)'; ctx.stroke();
  ctx.restore();
}

// Sisal rope wrapped round a post (for scratching).
function rope(ctx, x, y0, y1, w) {
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y0, w, y1 - y0, 1.2);
  ctx.fillStyle = WOOD.rope;
  ctx.fill();
  outline(ctx, 0.8);
  for (let y = y0 + 1.4; y < y1 - 0.5; y += 1.5) stroke(ctx, [[x - w / 2 + 0.4, y], [x + w / 2 - 0.4, y + 0.5]], 0.35, WOOD.ropeLine);
}

// A round wooden platform (a slice of tree trunk), seen slightly from above.
function disk(ctx, cx, cy, rx, ry, thick) {
  ctx.beginPath();
  ctx.ellipse(cx, cy + thick, rx, ry, 0, 0, Math.PI);
  ctx.lineTo(cx - rx, cy);
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fillStyle = WOOD.dark;
  ctx.fill();
  outline(ctx);
  const g = ctx.createLinearGradient(cx - rx, cy, cx + rx, cy);
  g.addColorStop(0, WOOD.light);
  g.addColorStop(1, WOOD.mid);
  ellipse(ctx, cx, cy, rx, ry, g);
  for (const k of [0.65, 0.35]) {                          // tree rings
    ctx.beginPath(); ctx.ellipse(cx, cy, rx * k, ry * k, 0, 0, Math.PI * 2);
    ctx.lineWidth = 0.5; ctx.strokeStyle = WOOD.ring; ctx.stroke();
  }
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); outline(ctx);
}

// The bowl-shaped bed.
function cup(ctx, cx, cy, rx, ry, depth) {
  ctx.beginPath();
  ctx.moveTo(cx - rx, cy);
  ctx.quadraticCurveTo(cx - rx * 0.9, cy + depth * 2, cx, cy + depth * 2);
  ctx.quadraticCurveTo(cx + rx * 0.9, cy + depth * 2, cx + rx, cy);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, cy, 0, cy + depth * 2);
  g.addColorStop(0, WOOD.mid);
  g.addColorStop(1, WOOD.dark);
  ctx.fillStyle = g;
  ctx.fill();
  outline(ctx);
  ellipse(ctx, cx, cy, rx, ry, '#b07a43');                  // inside of the bowl
  ellipse(ctx, cx, cy + ry * 0.25, rx * 0.75, ry * 0.6, 'rgba(255, 220, 170, 0.35)');
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); outline(ctx);
}

// A fluffy pom-pom toy swinging on a string.
function pompom(ctx, x, y0, len, sway) {
  const bx = x + sway * 2.5, by = y0 + len;
  stroke(ctx, [[x, y0], [bx, by - 2.6]], 0.45, '#8a6a45');
  blob(ctx, bx, by, 3, 3, { fill: WOOD.pom, tufts: [{ a: 0, w: Math.PI, s: 0.35, n: 11 }] });
}

function drawTree(ctx, t = 0) {
  const sw = Math.sin(t * 1.3);
  ctx.beginPath();                                          // base board
  ctx.roundRect(12, 150, 74, 7, 2);
  ctx.fillStyle = WOOD.mid; ctx.fill(); outline(ctx);
  branch(ctx, [[38, 124], [40, 92], [51, 36]], 7);          // main trunk
  branch(ctx, [[42, 96], [30, 86], [22, 66]], 4.5);         // branch to the left platform
  rope(ctx, 39.5, 99, 120, 8.4);
  ctx.beginPath();                                          // cubby house
  ctx.roundRect(19, 118, 38, 33, 2.5);
  const g = ctx.createLinearGradient(0, 118, 0, 151);
  g.addColorStop(0, WOOD.light); g.addColorStop(1, WOOD.mid);
  ctx.fillStyle = g; ctx.fill(); outline(ctx);
  stroke(ctx, [[20.5, 122], [55.5, 122]], 0.6, WOOD.ring);
  ctx.beginPath();                                          // its round doorway
  ctx.moveTo(30.5, 150.4); ctx.lineTo(30.5, 139); ctx.arc(38, 139, 7.5, Math.PI, 0); ctx.lineTo(45.5, 150.4); ctx.closePath();
  ctx.fillStyle = WOOD.hole; ctx.fill(); outline(ctx);
  branch(ctx, [[67, 152], [71, 128], [64, 100]], 6);        // right trunk
  branch(ctx, [[68, 138], [75, 134], [80, 128]], 4.5);      // branch to the low dish
  rope(ctx, 69.5, 112, 128, 7.6);
  disk(ctx, 80, 126, 13, 3.2, 2.5);                         // low dish
  pompom(ctx, 86, 128.5, 17, -sw);
  cup(ctx, 56, 95, 17, 3.8, 5);                             // bowl bed
  disk(ctx, 22, 64, 14, 3.4, 3);                            // left platform
  pompom(ctx, 13, 66.5, 20, sw);
  disk(ctx, 52, 34, 22, 5, 4);                              // top platform
  pompom(ctx, 64, 38.5, 22, Math.sin(t * 1.1 + 1));
}

// --- sparrow -------------------------------------------------------------------
// Drawn in a 32 x 32 box, feet on y = 28, facing right.
// flying: wings flap; otherwise it stands, hopping and pecking now and then.
const BIRD = { body: '#b57f52', cap: '#8a5634', cheek: '#f2ebe0', belly: '#f5ead9', wing: '#7b4e2c', leg: '#cf8c4c', beak: '#f2b33d' };

function drawBird(ctx, t, flying) {
  ctx.save();
  const hop = flying ? 0 : Math.max(0, Math.sin(t * 7)) * (Math.floor(t / 1.6) % 2 ? 1.6 : 0);   // little hops
  const peck = !flying && (t % 2.3) > 1.9 ? 0.45 : 0;                                            // and pecks
  ctx.translate(0, -hop);
  ctx.translate(16, 25); ctx.rotate(peck); ctx.translate(-16, -25);
  const flap = Math.sin(t * 30);
  if (flying) {                                             // far wing (behind the body)
    ctx.save(); ctx.translate(15, 19); ctx.rotate(-0.5 - flap * 0.9);
    ellipse(ctx, -1, -4, 3, 6, '#5f3c22', true); ctx.restore();
  } else {
    for (const x of [15, 18]) stroke(ctx, [[x, 25], [x, 28]], 0.7, BIRD.leg);   // little legs
  }
  ctx.beginPath();                                          // tail
  ctx.moveTo(10.5, 21); ctx.lineTo(3.5, 16.5); ctx.lineTo(4.5, 23.5); ctx.closePath();
  ctx.fillStyle = BIRD.wing; ctx.fill(); outline(ctx, 0.7);
  ellipse(ctx, 15.5, 21.5, 6.6, 5.3, BIRD.body);            // body
  ctx.beginPath(); ctx.ellipse(15.5, 21.5, 6.6, 5.3, 0, 0, Math.PI * 2); outline(ctx, 0.8);
  ellipse(ctx, 17.5, 23.6, 4, 2.8, BIRD.belly);
  ctx.save();                                               // head with a brown cap and pale cheeks
  ctx.beginPath(); ctx.arc(21, 16, 4.6, 0, Math.PI * 2);
  ctx.fillStyle = BIRD.body; ctx.fill();
  ctx.clip();
  ellipse(ctx, 21, 12.8, 5, 3, BIRD.cap);
  ellipse(ctx, 22.4, 17.6, 2.6, 1.8, BIRD.cheek);
  ctx.restore();
  ctx.beginPath(); ctx.arc(21, 16, 4.6, 0, Math.PI * 2); outline(ctx, 0.8);
  ellipse(ctx, 22.7, 15.6, 0.9, 0.95, COL.eye);
  ellipse(ctx, 22.4, 15.2, 0.32, 0.32, '#ffffff');
  ellipse(ctx, 23.4, 18.3, 0.9, 0.5, COL.blush);
  ctx.beginPath();                                          // beak
  ctx.moveTo(25.2, 15.4); ctx.lineTo(28.2, 16.6); ctx.lineTo(25.2, 17.8); ctx.closePath();
  ctx.fillStyle = BIRD.beak; ctx.fill(); outline(ctx, 0.6);
  ctx.save();                                               // near wing: flapping or folded
  if (flying) { ctx.translate(14.5, 19.5); ctx.rotate(-0.4 + flap * 0.9); ellipse(ctx, -0.5, -4.5, 3.2, 6.4, BIRD.wing, true); }
  else { ellipse(ctx, 13.8, 21.2, 5, 3.2, BIRD.wing, true, 0.25); stroke(ctx, [[11, 21], [16, 22.4]], 0.4, '#5f3c22'); }
  ctx.restore();
  ctx.restore();
}

function drawTub(ctx, t = 0) {
  drawTubBack(ctx, t);
  drawTubFront(ctx, t, false);
}

// Draw a play thing by name. level: food left (1 = full); angle: yarn roll; flying: the sparrow.
function drawProp(ctx, kind, level, t, angle, flying) {
  if (kind === 'tree') drawTree(ctx, t);
  else if (kind === 'bird') drawBird(ctx, t, flying);
  else if (kind === 'bowl') drawBowl(ctx, level);
  else if (kind === 'fish') drawFish(ctx, 1 - level);
  else if (kind === 'tub') drawTub(ctx, t);
  else if (kind === 'yarn') drawYarn(ctx, angle);
}
