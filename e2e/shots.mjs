// Screenshot sweep + overlap audit: every scripted scene in src/app/debug.ts (a seeded encounter
// replayed through the real sim and presentation to a fixed tick, then frozen), one PNG each at
// 2x (1280x720). The UI's overlap audit (src/ui/audit.ts) lists 2D texts that clash, overflow or
// get covered; issues are boxed in magenta and listed in e2e/out/shots/report.json. Exits non-zero
// if any shot has issues or the page logged errors.
// Usage: node e2e/shots.mjs [scene ...]
import fs from 'node:fs';
import { serve, launch, ready, geometry, OUT } from './serve.mjs';

const dir = `${OUT}/shots`;
fs.mkdirSync(dir, { recursive: true });
const only = process.argv.slice(2);
const srv = await serve();
const { browser, page, errors } = await launch({ width: 1280, height: 720 });
const report = {};
let bad = 0;

try {
  await page.goto(srv.url);
  await ready(page);
  await page.evaluate(async () => {
    window.__app.ui.audit = true;
    window.__audit = await import('/src/ui/audit.ts');
  });
  const g = await geometry(page);
  const scenes = await page.evaluate(() => [...window.__app.scenes]);
  for (const name of scenes) {
    if (only.length && !only.includes(name)) continue;
    await page.evaluate((n) => window.__app.scene(n), name);
    // let a few frames draw (SwiftShader is slow)
    await page.waitForTimeout(500);
    const issues = await page.evaluate(() => window.__audit.findIssues(window.__app.ui.lastAudit, { w: 640, h: 360 }));
    await page.evaluate(([issues, g]) => {
      const root = document.createElement('div');
      root.id = '__auditOverlay';
      root.style.cssText = 'position:fixed;inset:0;pointer-events:none';
      const k = g.zoom / g.dpr;
      for (const i of issues) {
        const b = document.createElement('div');
        b.style.cssText = `position:absolute;border:1px solid #f0f;left:${g.ox / g.dpr + i.rect.x * k}px;top:${g.top / g.dpr + i.rect.y * k}px;width:${i.rect.w * k}px;height:${i.rect.h * k}px`;
        root.appendChild(b);
      }
      document.body.appendChild(root);
    }, [issues, g]);
    await page.screenshot({ path: `${dir}/${name}.png` });
    await page.evaluate(() => document.getElementById('__auditOverlay')?.remove());
    report[name] = issues;
    bad += issues.length;
    console.log(`${issues.length ? 'ISSUES' : 'ok    '} ${name}${issues.map((i) => `\n   ${i.type}: "${i.text}"${i.other ? ` vs ${i.other}` : ''}`).join('')}`);
  }
  fs.writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2));
  if (errors.length) console.log('console errors:\n' + errors.join('\n'));
} finally {
  await browser.close();
  await srv.close();
}
console.log(`\n${Object.keys(report).length} shots in ${dir}, ${bad} overlap issues${errors.length ? `, ${errors.length} console errors` : ''}.`);
console.log('clash: two texts overlap. overflow: text runs past the panel/button it starts in. covered: something drawn later paints over the text.');
process.exit(bad || errors.length ? 1 : 0);
