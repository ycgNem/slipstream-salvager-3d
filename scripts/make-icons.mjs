// Renders the placeholder app icon (a scrap robot's claw cutting through teal speed lines, with a
// gold bolt) at several sizes into public/ and build/. Code-drawn like the rest of the slice's art;
// replaced in the art overhaul. Usage: node scripts/make-icons.mjs (needs Playwright + Chrome)
import { chromium } from 'playwright';
import fs from 'node:fs';

fs.mkdirSync('build', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const sizes = [[192, 'public/icon-192.png'], [512, 'public/icon-512.png'], [512, 'public/icon-maskable-512.png', true], [256, 'build/icon.png'], [180, 'public/apple-touch-icon.png'], [32, 'public/favicon-32.png']];
for (const [size, file, maskable] of sizes) {
  const url = await page.evaluate(([size, maskable]) => {
    const N = 32; // design grid
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    // Resurrect 64 colors
    const P = { ink: '#2e222f', plum: '#3e3546', slate: '#625565', teal: '#0eaf9b', teal2: '#30e1b9', teal3: '#8ff8e2', rust: '#9e4539', rust2: '#cd683d', orange: '#e6904e', gold: '#f9c22b', mist: '#9babb2', frost: '#c7dcd0' };
    const s = size / N;
    const pad = maskable ? 4 : 0;
    const k = (N - pad * 2) / N;
    const g = (v) => pad + v * k;
    const px = (gx, gy, col) => { x.fillStyle = col; x.fillRect(Math.floor(g(gx) * s), Math.floor(g(gy) * s), Math.ceil(s * k), Math.ceil(s * k)); };
    const rect = (gx, gy, w, h, col) => { for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) px(gx + xx, gy + yy, col); };
    x.fillStyle = P.plum;
    if (maskable) x.fillRect(0, 0, size, size);
    else { x.beginPath(); x.roundRect(0, 0, size, size, size * 0.18); x.fill(); }
    // speed lines
    rect(2, 9, 10, 1, P.teal); rect(4, 14, 12, 1, P.teal2); rect(1, 19, 9, 1, P.teal); rect(5, 24, 8, 1, P.teal);
    // body
    rect(10, 11, 12, 12, P.ink); rect(11, 12, 10, 10, P.rust); rect(11, 12, 10, 2, P.rust2); rect(12, 12, 4, 1, P.orange);
    rect(10, 22, 12, 3, P.ink); rect(11, 23, 10, 1, P.slate);
    // claw
    rect(22, 13, 6, 2, P.ink); rect(22, 19, 6, 2, P.ink); rect(22, 14, 5, 1, P.mist); rect(22, 19, 5, 1, P.mist);
    rect(26, 15, 2, 4, P.ink); rect(27, 14, 2, 1, P.frost); rect(27, 19, 2, 1, P.frost);
    px(29, 16, P.teal3); px(29, 17, P.teal3); px(30, 16, P.teal2);
    // gold bolt (salvage)
    rect(14, 15, 4, 4, P.ink); rect(15, 16, 2, 2, P.gold);
    return c.toDataURL('image/png');
  }, [size, !!maskable]);
  fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote', file);
}
await browser.close();
