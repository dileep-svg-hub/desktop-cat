/*
  src/main/settings.js  —  remembers your choices between launches
  -----------------------------------------------------------------
  Settings live in a small JSON text file in the app's own data folder:
    Windows: C:\Users\<you>\AppData\Roaming\Desktop Cat\settings.json
    Mac:     ~/Library/Application Support/Desktop Cat/settings.json
  If the file is missing or broken we simply use the defaults below.
  ("Launch at startup" isn't stored here — the operating system remembers that.)
*/

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  size: 'medium',     // cat size: 'small' | 'medium' | 'large'
  speed: 'normal',    // walking speed: 'slow' | 'normal' | 'fast'
  paused: false,      // cat holds still
  mischief: false,    // sometimes nudges the mouse pointer (off unless you turn it on)
  muted: false,       // (only matters if you added your own sounds)
  tree: true,         // show the cat tree
  treeX: null,        // where you put it (screen x); null = bottom-left corner
};

let data = { ...DEFAULTS };

function file() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function load() {
  try {
    data = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), 'utf8')) };
  } catch {
    data = { ...DEFAULTS };   // first launch, or the file was damaged
  }
  return data;
}

function get(key) {
  return data[key];
}

function set(key, value) {
  data[key] = value;
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Could not save settings:', err.message);
  }
}

module.exports = { load, get, set };
