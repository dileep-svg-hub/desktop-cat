/*
  src/main/preload.js  —  the bridge
  ----------------------------------
  For safety, the web pages (renderer) are not allowed to touch Node.js or the
  OS directly. This small file runs before a page loads and hands it a
  controlled "catAPI" object with exactly the few things it needs: a way to
  send messages to the main process and a way to receive them.
  Both the kitten's page and the play-thing page use it.
*/

const { contextBridge, ipcRenderer } = require('electron');

const listen = (channel) => (callback) => ipcRenderer.on(channel, (_event, value) => callback(value));

contextBridge.exposeInMainWorld('catAPI', {
  // page -> main
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
  log: (...args) => ipcRenderer.send('log', ...args),
  // Ask main to slide the cat dx pixels along the floor.
  // Answers with { edge: 'left' | 'right' | null, cx, left, right }.
  moveBy: (dx) => ipcRenderer.invoke('move-by', dx),
  // You picked this window's thing up at (x, y) inside the window / you let go.
  dragStart: (x, y) => ipcRenderer.send('drag-start', x, y),
  dragEnd: () => ipcRenderer.send('drag-end'),
  // Where is the mouse pointer? Answers { x, y, sameDisplay, floor, idleMs }.
  getCursor: () => ipcRenderer.invoke('get-cursor'),
  // Right-clicked the cat: show the little menu.
  showMenu: () => ipcRenderer.send('show-menu'),
  // The cat playing with the play thing:
  propLevel: (level) => ipcRenderer.send('prop-level', level),   // food left (1 = full)
  propDone: () => ipcRenderer.send('prop-done'),                 // finished: take it away
  propHide: () => ipcRenderer.send('prop-hide'),                 // hopped into the tub
  propShow: () => ipcRenderer.send('prop-show'),
  propKick: (vx) => ipcRenderer.send('prop-kick', vx),           // bat the yarn (pixels/second)
  // The cat tree and the sparrow:
  leap: (perch, atX) => ipcRenderer.send('leap', perch, atX),    // jump to 'dish' | 'bowl' | 'left' | 'top' | 'roof' (at x) | 'floor'
  birdCome: () => ipcRenderer.send('bird-come'),                 // invite a sparrow
  birdScare: () => ipcRenderer.send('bird-scare'),               // pounce! (or you clicked it)
  nudgeCursor: (dx) => ipcRenderer.send('nudge-cursor', dx),     // mischief mode: bat the pointer sideways

  // main -> kitten page
  onConfig: listen('config'),          // { scale, muted, sounds }
  onLanded: listen('landed'),          // the dropped cat reached the floor: { height, cx, left, right }
  onSetMuted: listen('set-muted'),     // mute switched on/off from the menu
  onSetPaused: listen('set-paused'),   // Pause / Hide from the menu
  onSetSpeed: listen('set-speed'),     // walking speed multiplier
  onSetMischief: listen('set-mischief'),
  onProp: listen('prop'),              // the play thing: { kind, cx, level, moving, reason } or null
  onTree: listen('tree'),              // the cat tree: { left, right, perches: { name: { x, y } } } or null
  onLeaped: listen('leaped'),          // finished a jump: { perch (or null = floor), height, cx, left, right }
  onFalling: listen('falling'),        // knocked off the tree
  onBird: listen('bird'),              // the sparrow: { phase, x, y, catX } or null when gone
  onRoof: listen('roof'),              // a window it could climb onto: { left, right, top } or null
  // main -> play-thing page
  onPropConfig: listen('prop-config'), // { kind, scale, level }
  onPropLevel: listen('prop-level'),   // food left
  onPropSpin: listen('prop-spin'),     // how far the yarn has rolled (radians)
  onPropFade: listen('prop-fade'),     // fade out, it's about to be removed
  onPropAnim: listen('prop-anim'),     // sparrow: { flying, facing }
});
