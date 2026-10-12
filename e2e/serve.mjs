// Shared by the e2e scripts: start the Vite dev server on a free port (or use BASE if it's set)
// and launch headless Chrome with WebGL on SwiftShader (e2e/launch.mjs).
import { createServer } from 'vite';
import fs from 'node:fs';
export { launch } from './launch.mjs';

export const OUT = 'e2e/out';
fs.mkdirSync(OUT, { recursive: true });

export async function serve() {
  if (process.env.BASE) return { url: process.env.BASE, close: async () => {} };
  const server = await createServer({ server: { port: 0, host: '127.0.0.1', hmr: false }, logLevel: 'error', clearScreen: false });
  await server.listen();
  const { port } = server.httpServer.address();
  return { url: `http://127.0.0.1:${port}/`, close: () => server.close() };
}

/** Wait until the app has loaded its models and shows the title. */
export async function ready(page) {
  await page.waitForFunction(() => window.__app?.screen === 'title', null, { timeout: 60000 });
}

/** The letterbox geometry, to turn logical 640x360 points into page (CSS) pixels. */
export async function geometry(page) {
  return page.evaluate(() => {
    const v = window.__app.view;
    const h = v.renderer.domElement.height;
    return { zoom: v.zoom, ox: v.ox, top: h - v.oy - 360 * v.zoom, dpr: v.dpr };
  });
}
