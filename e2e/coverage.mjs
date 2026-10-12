// Model and texture coverage (THREEJS-NOTES "Testing"): every model the renderer asks for
// (src/render3d/models.ts MODEL_NAMES) must load from its Blender-built .glb, not the code
// placeholder; every node name the renderer looks up must exist in it; every texture must be pixel-
// filtered (nearest, no mipmaps); and the triangle budgets of rule 9 must hold. Writes
// e2e/out/coverage.json. Usage: node e2e/coverage.mjs
import fs from 'node:fs';
import { serve, launch, ready, OUT } from './serve.mjs';

/** the node names the renderer finds by name (art/README.md) */
const NODES = {
  rammer: ['body', 'eyes', 'mount_rear'],
  booster: ['shell', 'nozzle_glow'],
  scrapper: ['body', 'tread_l', 'tread_r', 'mount_rear', 'claw_root'],
  claw: ['arm', 'jaw_l', 'jaw_r', 'glow'],
  pillar: ['pillar'],
  wall: ['wall'],
  gate: ['frame', 'door_l', 'door_r', 'lamp'],
  floor: ['floor'],
};
const BUDGET = { rammer: 450, booster: 200, scrapper: 350, claw: 300, pillar: 150, wall: 60, gate: 250, floor: 2 };

const srv = await serve();
const { browser, page } = await launch();
let res;
try {
  await page.goto(srv.url);
  await ready(page);
  res = await page.evaluate((NODES) => {
    const a = window.__app;
    const out = {};
    for (const name of Object.keys(NODES)) {
      const g = a.models.get(name);
      let tris = 0;
      const textures = [];
      g.traverse((o) => {
        if (!o.isMesh) return;
        const geo = o.geometry;
        tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (m.map) textures.push({ w: m.map.image?.width, h: m.map.image?.height, nearest: m.map.magFilter === 1003 && m.map.minFilter === 1003, mips: m.map.generateMipmaps });
        }
      });
      out[name] = { source: a.models.source[name], missing: NODES[name].filter((n) => !g.getObjectByName(n)), tris, textures };
    }
    return out;
  }, NODES);
} finally {
  await browser.close();
  await srv.close();
}
fs.writeFileSync(`${OUT}/coverage.json`, JSON.stringify(res, null, 2));
let bad = 0;
for (const [name, r] of Object.entries(res)) {
  const probs = [];
  if (r.source !== 'glb') probs.push('PLACEHOLDER (no .glb)');
  if (r.missing.length) probs.push(`missing nodes: ${r.missing.join(', ')}`);
  if (r.tris > BUDGET[name]) probs.push(`${r.tris} tris > ${BUDGET[name]}`);
  if (r.source === 'glb' && !r.textures.length) probs.push('no pixel texture');
  for (const t of r.textures) if (!t.nearest || t.mips) probs.push(`texture ${t.w}x${t.h} not pixel-filtered`);
  const tex = [...new Set(r.textures.map((t) => `${t.w}x${t.h}`))].join(' ');
  console.log(`${probs.length ? 'FAIL' : 'ok  '} ${name.padEnd(9)} ${String(r.tris).padStart(4)} tris  ${tex.padEnd(8)} ${probs.join('; ')}`);
  bad += probs.length;
}
process.exit(bad ? 1 : 0);
