/*
  tools/make-icons.js  —  makes the app and tray icons
  -----------------------------------------------------
  Draws the kitten's head (with the same code that draws the kitten) and
  saves it as PNG files in assets/icons:
    tray.png / tray@2x.png  — the little icon by the clock / in the menu bar
    icon.png (1024 x 1024)  — the app icon; the installer builder turns it into
                              .ico (Windows) and .icns (Mac) by itself
  Run it with:  npm run icons   (only needed if you change how the kitten looks)
*/

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadFile(path.join(__dirname, 'icons.html'));
  const icons = await win.webContents.executeJavaScript('window.icons');
  const outDir = path.join(__dirname, '..', 'assets', 'icons');
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, dataUrl] of Object.entries(icons)) {
    fs.writeFileSync(path.join(outDir, name), Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log('wrote assets/icons/' + name);
  }
  app.quit();
});
