// Smoke test: title -> Play -> drive with real key presses (W thrust, A/D steer) -> rip -> pause ->
// resume, checking pointer lock is asked for on click, the sim stops while paused, whole-number
// scaling, and zero console errors. Starts its own dev server unless BASE is set.
// Usage: node e2e/smoke.mjs
import { serve, launch, ready, geometry, OUT } from './serve.mjs';

const srv = await serve();
const { browser, page, errors } = await launch();
const shot = (n) => page.screenshot({ path: `${OUT}/smoke-${n}.png` });
const wait = (ms) => page.waitForTimeout(ms);
let failed = false;
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) failed = true;
};

try {
  // count pointer-lock requests (headless can't grant one; the game must still play on keys)
  await page.addInitScript(() => {
    window.__locks = 0;
    const orig = HTMLCanvasElement.prototype.requestPointerLock;
    HTMLCanvasElement.prototype.requestPointerLock = function (...a) {
      window.__locks++;
      try {
        return orig.apply(this, a);
      } catch {
        return Promise.resolve();
      }
    };
  });
  await page.goto(srv.url);
  await ready(page);
  await wait(500);
  await shot('01-title');
  check(await page.evaluate(() => window.__app.models && Object.values(window.__app.models.source).every((s) => s === 'glb')), 'every model is a Blender .glb (no placeholders)');

  const g = await geometry(page);
  const at = (x, y) => [(g.ox + x * g.zoom) / g.dpr, (g.top + y * g.zoom) / g.dpr];
  await page.mouse.click(...at(320, 187));
  await wait(400);
  check(await page.evaluate(() => window.__app.screen === 'play'), 'Play starts an encounter');
  check(await page.evaluate(() => window.__locks > 0), 'Play asks for pointer lock');

  // steer at rest: D turns the body right (clockwise on the 2D map), in place
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const heading = () => page.evaluate(() => window.__app.play.world.player.heading);
  let h0 = await heading();
  await page.keyboard.down('KeyD');
  await wait(250);
  await page.keyboard.up('KeyD');
  let dh = wrap((await heading()) - h0);
  check(dh > 0.3, `D at rest turns the body right (${dh.toFixed(2)} rad)`);

  // drive down the long bottom straight: W for a second should reach Slipstream
  await page.evaluate(() => {
    const a = window.__app, p = a.play.world.player;
    Object.assign(p, { x: 60, y: 300, heading: 0, lastHeading: 0, speed: 0 });
    a.play.steer.reset(0);
  });
  await page.keyboard.down('KeyW');
  await wait(1300);
  const fast = await page.evaluate(() => window.__app.play.world.player.speed);
  check(fast >= 190, `holding W reaches Slipstream (speed ${fast.toFixed(0)})`);
  await shot('02-driving');
  await page.keyboard.press('Space');
  await wait(100);
  check(await page.evaluate(() => window.__app.play.recent.some((e) => e.k === 'rip')), 'Space rips');
  await wait(150);
  h0 = await heading();
  await page.keyboard.down('KeyA');
  await wait(250);
  await page.keyboard.up('KeyA');
  dh = wrap((await heading()) - h0);
  check(dh < -0.3, `A at speed turns the body left (${dh.toFixed(2)} rad)`);
  await page.keyboard.down('KeyS');
  await wait(900);
  await page.keyboard.up('KeyS');
  await page.keyboard.up('KeyW');
  const slow = await page.evaluate(() => window.__app.play.world.player.speed);
  check(slow < 60, `S brakes (speed ${slow.toFixed(0)})`);
  await wait(2500);
  const rammers = await page.evaluate(() => window.__app.play.world.rammers.length);
  check(rammers >= 1, `wave 1 sends a Rammer in (${rammers})`);
  await shot('03-wave1');

  await page.keyboard.press('Escape');
  await wait(300);
  check(await page.evaluate(() => window.__app.play.paused), 'Esc pauses');
  await shot('04-pause');
  const t0 = await page.evaluate(() => window.__app.play.world.tick);
  await wait(400);
  check((await page.evaluate(() => window.__app.play.world.tick)) === t0, 'the sim stops while paused');
  await page.keyboard.press('Escape');
  await wait(300);
  check(!(await page.evaluate(() => window.__app.play.paused)), 'Esc resumes');

  check(Number.isInteger(g.zoom) && g.zoom >= 1, `whole-number scale (x${g.zoom})`);
  const gl = await page.evaluate(() => window.__app.view.renderer.capabilities.isWebGL2);
  check(gl, 'WebGL2 is running');
  check(errors.length === 0, `no console errors${errors.length ? ':\n' + errors.join('\n') : ''}`);
} catch (e) {
  console.error(e);
  failed = true;
} finally {
  await browser.close();
  await srv.close();
}
process.exit(failed ? 1 : 0);
