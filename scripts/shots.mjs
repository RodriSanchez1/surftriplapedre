// Capturas de revisión visual, en celular (390 px) y escritorio (1280 px).
// Uso: node scripts/shots.mjs <url-base> <carpeta-salida> [ruta ...]
// Ej.: node scripts/shots.mjs http://localhost:4321/surftriplapedre /tmp/shots / /pt/ /surfistas/juan/
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const [baseUrl, out, ...rutas] = process.argv.slice(2);
if (!baseUrl || !out) {
  console.error('Uso: node scripts/shots.mjs <url-base> <carpeta-salida> [ruta ...]');
  process.exit(1);
}
const paths = rutas.length ? rutas : ['/', '/pt/', '/design/'];
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
