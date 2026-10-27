// Converts sessions/<date>/insights-<lang>.md into site content files.
// Usage: node scripts/import-session.mjs <YYYY-MM-DD> "<ES title>" "<PT title>"
//
// Input format (same as sessions/2026-10-26/insights-es.md). The headings are Spanish/Portuguese
// because that is the language of the content:
//   ## Resumen | Resumo                 → session body
//   ## <Name from surfers.yaml>         → the surfer's insight; **Bold** lines become ### Bold
//   ## Plan ... | Plano ...             → first paragraph = planNote, table = focus/secondaryFocus/cue,
//                                         final list = logistics
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dump, load } from 'js-yaml';

const [date, ...titles] = process.argv.slice(2);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || titles.length !== 2) {
  console.error('Usage: node scripts/import-session.mjs <YYYY-MM-DD> "<ES title>" "<PT title>"');
  process.exit(1);
}

const surfers = load(readFileSync('src/data/surfers.yaml', 'utf8'));
const idByName = new Map(surfers.map((s) => [s.name.toLowerCase(), s.id]));
const frontmatter = (data, body) => `---\n${dump(data, { lineWidth: -1 })}---\n\n${body.trim()}\n`;
const stripQuotes = (s) => s.trim().replace(/^["“]|["”]$/g, '');

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
  const note = lines.slice(0, tableStart).join('\n').trim();
  const rows = lines.slice(tableStart + 2, tableEnd === -1 ? undefined : tableEnd);
  const foci = new Map();
  for (const row of rows) {
    const [name, focus, secondaryFocus, cue] = row.split('|').slice(1, -1).map((c) => c.trim());
    foci.set(name.toLowerCase(), { focus, secondaryFocus, cue: stripQuotes(cue) });
  }
  const logistics = lines
    .slice(tableEnd === -1 ? lines.length : tableEnd)
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim());
  return { note, foci, logistics };
}

['es', 'pt'].forEach((lang, i) => {
  const src = `sessions/${date}/insights-${lang}.md`;
  if (!existsSync(src)) {
    console.log(`- ${src} does not exist, skipping`);
    return;
  }
  const secs = sections(readFileSync(src, 'utf8'));
  const summary = secs.find((s) => /^resum/i.test(s.title));
  const plan = secs.find((s) => /^plan/i.test(s.title));
  if (!summary || !plan) throw new Error(`${src}: the summary or plan sections are missing`);
  const { note, foci, logistics } = parsePlan(plan.body);

  mkdirSync('src/content/sessions', { recursive: true });
  const sessionOut = `src/content/sessions/${date}.${lang}.md`;
  writeFileSync(sessionOut, frontmatter({ date, title: titles[i], planNote: note, logistics }, summary.body));
  console.log(`+ ${sessionOut}`);

  for (const sec of secs) {
    const id = idByName.get(sec.title.toLowerCase());
    if (!id) continue;
    const f = foci.get(sec.title.toLowerCase());
    if (!f) throw new Error(`${src}: ${sec.title} is not in the plan table`);
    const body = sec.body.replace(/^\*\*([^*]+)\*\*$/gm, '### $1');
    mkdirSync(`src/content/insights/${date}`, { recursive: true });
    const out = `src/content/insights/${date}/${id}.${lang}.md`;
    writeFileSync(out, frontmatter({ date, surfer: id, ...f }, body));
    console.log(`+ ${out}`);
  }
});
