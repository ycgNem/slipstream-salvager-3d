// Headless Chromium with WebGL on SwiftShader (THREEJS-NOTES "Testing"): the software renderer
// stands in for a weak laptop and needs no GPU. Flags confirmed on this machine's Chrome
// (DECISIONS #8): without --enable-unsafe-swiftshader, WebGL is refused in headless mode.
import { chromium } from 'playwright';

export const GL_FLAGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];

export async function launch(viewport = { width: 1280, height: 720 }) {
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: true, args: GL_FLAGS });
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
  return { browser, page, errors };
}
