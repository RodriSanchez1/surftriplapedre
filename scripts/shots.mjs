// Visual review screenshots, on mobile (390 px) and desktop (1280 px).
// Usage: node scripts/shots.mjs <base-url> <output-folder> [path ...]
// E.g.: node scripts/shots.mjs http://localhost:4321 /tmp/shots / /pt/ /surfers/juan/
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const [baseUrl, out, ...routes] = process.argv.slice(2);
if (!baseUrl || !out) {
  console.error('Usage: node scripts/shots.mjs <base-url> <output-folder> [path ...]');
  process.exit(1);
}
const paths = routes.length ? routes : ['/', '/pt/', '/design/'];
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
for (const [name, width] of [['mobile', 390], ['desktop', 1280]]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  for (const p of paths) {
    const res = await page.goto(baseUrl + p, { waitUntil: 'networkidle' });
    const file = `${out}/${name}${p.replaceAll('/', '_')}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(res?.status(), file);
  }
  await page.close();
}
await browser.close();
