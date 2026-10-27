// Convierte sesiones/<fecha>/insights-<lang>.md en archivos de contenido del sitio.
// Uso: node scripts/import-sesion.mjs <AAAA-MM-DD> "<título ES>" "<título PT>"
//
// Formato de entrada (el mismo de sesiones/2026-10-26/insights-es.md):
//   ## Resumen | Resumo                 → cuerpo de la sesión
//   ## <Nombre de surfistas.yaml>       → insight del surfista; las líneas **Así** pasan a ### Así
//   ## Plan ... | Plano ...             → párrafo inicial = planNota, tabla = foco/focoSecundario/frase,
//                                         lista final = logistica
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dump, load } from 'js-yaml';

const [fecha, ...titulos] = process.argv.slice(2);
if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? '') || titulos.length !== 2) {
  console.error('Uso: node scripts/import-sesion.mjs <AAAA-MM-DD> "<título ES>" "<título PT>"');
  process.exit(1);
}

const surfistas = load(readFileSync('src/data/surfistas.yaml', 'utf8'));
const idPorNombre = new Map(surfistas.map((s) => [s.nombre.toLowerCase(), s.id]));
const frontmatter = (data, body) => `---\n${dump(data, { lineWidth: -1 })}---\n\n${body.trim()}\n`;
const sinComillas = (s) => s.trim().replace(/^["“]|["”]$/g, '');

function sections(md) {
  return md
    .split(/^## /m)
    .slice(1)
    .map((chunk) => {
      const nl = chunk.indexOf('\n');
      return { title: chunk.slice(0, nl).trim(), body: chunk.slice(nl + 1).trim() };
    });
}

function parsePlan(body) {
  const lines = body.split('\n');
  const tableStart = lines.findIndex((l) => l.startsWith('|'));
  const tableEnd = lines.findIndex((l, i) => i > tableStart && !l.startsWith('|'));
  const nota = lines.slice(0, tableStart).join('\n').trim();
  const rows = lines.slice(tableStart + 2, tableEnd === -1 ? undefined : tableEnd);
  const focos = new Map();
  for (const row of rows) {
    const [nombre, foco, focoSecundario, frase] = row.split('|').slice(1, -1).map((c) => c.trim());
    focos.set(nombre.toLowerCase(), { foco, focoSecundario, frase: sinComillas(frase) });
  }
  const logistica = lines
    .slice(tableEnd === -1 ? lines.length : tableEnd)
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim());
  return { nota, focos, logistica };
}

['es', 'pt'].forEach((lang, i) => {
  const src = `sesiones/${fecha}/insights-${lang}.md`;
  if (!existsSync(src)) {
    console.log(`- ${src} no existe, se saltea`);
    return;
  }
  const secs = sections(readFileSync(src, 'utf8'));
  const resumen = secs.find((s) => /^resum/i.test(s.title));
  const plan = secs.find((s) => /^plan/i.test(s.title));
  if (!resumen || !plan) throw new Error(`${src}: faltan las secciones de resumen o de plan`);
  const { nota, focos, logistica } = parsePlan(plan.body);

  mkdirSync('src/content/sesiones', { recursive: true });
  const sesionOut = `src/content/sesiones/${fecha}.${lang}.md`;
  writeFileSync(sesionOut, frontmatter({ fecha, titulo: titulos[i], planNota: nota, logistica }, resumen.body));
  console.log(`+ ${sesionOut}`);

  for (const sec of secs) {
    const id = idPorNombre.get(sec.title.toLowerCase());
    if (!id) continue;
    const f = focos.get(sec.title.toLowerCase());
    if (!f) throw new Error(`${src}: ${sec.title} no está en la tabla del plan`);
    const body = sec.body.replace(/^\*\*([^*]+)\*\*$/gm, '### $1');
    mkdirSync(`src/content/insights/${fecha}`, { recursive: true });
    const out = `src/content/insights/${fecha}/${id}.${lang}.md`;
    writeFileSync(out, frontmatter({ fecha, surfista: id, ...f }, body));
    console.log(`+ ${out}`);
  }
});
