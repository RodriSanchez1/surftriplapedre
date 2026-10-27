// Workflow de punta a punta: audios del coach en Drive → transcripción local → insights.
//
// Uso:
//   node scripts/sesion-auto.mjs                 procesa las fechas listas
//   node scripts/sesion-auto.mjs --listar        solo muestra qué hay y en qué estado
//   node scripts/sesion-auto.mjs --fecha <AAAA-MM-DD> [--local] [--sin-claude] [--forzar]
//   node scripts/sesion-auto.mjs --espera <minutos>
//
// --local       no usa Drive: toma los audios que ya están en sesiones/<fecha>/
// --sin-claude  baja y transcribe, pero no genera los insights
// --forzar      reprocesa una fecha ya procesada (pisa los insights)
//
// Variables: SURFTRIP_RCLONE_REMOTE (por defecto "drive"), SURFTRIP_MODELO (por defecto "sonnet"),
// SURFTRIP_RAMA_BASE (por defecto "main").
// Nunca hace push: deja un commit en feat/sesion-<fecha> y vuelve a la rama en la que estaba.
import { spawnSync } from 'node:child_process';
import {
  appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { parseArgs } from 'node:util';
import { load } from 'js-yaml';
import { agruparPorFecha, estadoDeFecha } from '../src/lib/audio/pendientes.ts';

const { values: op } = parseArgs({
  options: {
    listar: { type: 'boolean', default: false },
    fecha: { type: 'string' },
    local: { type: 'boolean', default: false },
    'sin-claude': { type: 'boolean', default: false },
    forzar: { type: 'boolean', default: false },
    espera: { type: 'string', default: '15' },
  },
});
if (op.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(op.fecha)) salir(`Fecha inválida: ${op.fecha}`);

const REMOTE = process.env.SURFTRIP_RCLONE_REMOTE ?? 'drive';
const MODELO = process.env.SURFTRIP_MODELO ?? 'sonnet';
const RAMA_BASE = process.env.SURFTRIP_RAMA_BASE ?? 'main';
const SKILL = '.claude/skills/procesar-sesion/SKILL.md';
const LOCK = 'sesiones/.sesion-auto.lock';

const trip = load(readFileSync('src/data/trip.yaml', 'utf8'))[0];
const carpeta = trip.audio?.carpetaDrive;
let log = null;

function salir(mensaje) {
  console.error(mensaje);
  process.exit(1);
}

function decir(mensaje) {
  console.log(mensaje);
  if (log) appendFileSync(log, `[${new Date().toISOString()}] ${mensaje}\n`);
}

/** Corre un comando. Con capturar devuelve la salida; si no, la salida va al log de la fecha. */
function correr(cmd, args, { capturar = false } = {}) {
  const fd = !capturar && log ? openSync(log, 'a') : null;
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: fd === null ? 'pipe' : ['ignore', fd, fd] });
  if (fd !== null) closeSync(fd);
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
  if (r.status !== 0) {
    const detalle = fd === null ? r.stderr : `ver ${log}`;
    throw new Error(`${cmd} ${args.slice(0, 2).join(' ')}… salió con ${r.status}: ${detalle}`);
  }
  return r.stdout ?? '';
}

function hay(cmd) {
  return spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0;
}

// --- Lock, para que dos corridas de cron no se pisen -------------------------------------------

function tomarLock() {
  if (existsSync(LOCK)) {
    const pid = Number(readFileSync(LOCK, 'utf8'));
    try {
      process.kill(pid, 0);
      salir(`Ya hay una corrida en curso (pid ${pid}).`);
    } catch {
      unlinkSync(LOCK); // quedó de una corrida que murió
    }
  }
  mkdirSync('sesiones', { recursive: true });
  writeFileSync(LOCK, String(process.pid), { flag: 'wx' });
  process.on('exit', () => existsSync(LOCK) && unlinkSync(LOCK));
}

// --- Dónde están los audios --------------------------------------------------------------------

function archivosEnDrive() {
  if (!carpeta) salir('Falta audio.carpetaDrive en src/data/trip.yaml.');
  if (!hay('rclone')) salir('No está rclone. Ver "Conectar el resumen automático" en AGENTS.md, o usar --local.');
  const json = correr('rclone', ['lsjson', `${REMOTE}:`, '--drive-root-folder-id', carpeta, '--files-only'], { capturar: true });
  return JSON.parse(json).map((f) => ({ nombre: f.Name, modificado: f.ModTime }));
}

function archivosLocales() {
  if (!existsSync('sesiones')) return [];
  return readdirSync('sesiones', { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) =>
      readdirSync(`sesiones/${d.name}`).map((nombre) => ({
        nombre,
        modificado: statSync(`sesiones/${d.name}/${nombre}`).mtime.toISOString(),
      })),
    );
}

function procesados(fecha) {
  const ruta = `sesiones/${fecha}/procesado.json`;
  return existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')).audios : null;
}

// --- Pasos -------------------------------------------------------------------------------------

function bajar(fecha, audios) {
  const faltan = audios.filter((a) => !existsSync(`sesiones/${fecha}/${a.nombre}`));
  if (!faltan.length) return decir('Los audios ya estaban bajados.');
  decir(`Bajando ${faltan.map((a) => a.nombre).join(', ')}`);
  const incluir = faltan.flatMap((a) => ['--include', a.nombre]);
  correr('rclone', ['copy', `${REMOTE}:`, `sesiones/${fecha}/`, '--drive-root-folder-id', carpeta, ...incluir]);
}

function transcribir(fecha, audios) {
  const nombres = audios.map((a) => a.nombre);
  const cruda = `sesiones/${fecha}/transcripcion-cruda.json`;
  if (existsSync(cruda) && JSON.stringify(JSON.parse(readFileSync(cruda, 'utf8')).audios) === JSON.stringify(nombres)) {
    return decir('La transcripción cruda ya estaba hecha con estos audios.');
  }
  if (!hay('uv')) salir('No está uv (https://docs.astral.sh/uv/).');
  decir('Transcribiendo (puede tardar varios minutos)…');
  correr('uv', ['run', 'scripts/transcribir.py', ...nombres.map((n) => `sesiones/${fecha}/${n}`)]);
  decir(`Transcripción cruda lista: sesiones/${fecha}/transcripcion-cruda.md`);
}

function generarInsights(fecha) {
  if (!hay('claude')) salir('No está el CLI de Claude Code.');
  if (correr('git', ['status', '--porcelain'], { capturar: true }).trim()) {
    throw new Error('El árbol de git tiene cambios sin commitear: no se generan los insights.');
  }
  const ramaOriginal = correr('git', ['branch', '--show-current'], { capturar: true }).trim();
  const rama = `feat/sesion-${fecha}`;
  if (spawnSync('git', ['cat-file', '-e', `${RAMA_BASE}:${SKILL}`]).status !== 0) {
    throw new Error(`${RAMA_BASE} no tiene la skill procesar-sesion. Mergeá feat/resumen-automatico o usá SURFTRIP_RAMA_BASE.`);
  }
  const existe = spawnSync('git', ['rev-parse', '--verify', '--quiet', rama]).status === 0;
  correr('git', existe ? ['switch', rama] : ['switch', '-c', rama, RAMA_BASE]);
  const antes = correr('git', ['rev-parse', 'HEAD'], { capturar: true });
  decir(`Rama ${rama}. Generando insights con Claude (${MODELO})…`);
  try {
    const prompt =
      `/procesar-sesion ${fecha}\n\n` +
      'Modo automático: no hay nadie para contestar preguntas. Ante una duda, tomá la decisión más prudente, ' +
      'dejala anotada en el mensaje final y seguí. Commiteá en la rama actual y no hagas push.';
    const salida = correr('claude', [
      '-p', prompt,
      '--model', MODELO,
      '--permission-mode', 'acceptEdits',
      '--allowedTools',
      'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Skill',
      'Bash(npm run *)', 'Bash(npm test*)', 'Bash(uv run scripts/transcribir.py *)',
      'Bash(git status*)', 'Bash(git diff*)', 'Bash(git log*)', 'Bash(git add *)', 'Bash(git commit *)',
      'Bash(ls *)', 'Bash(wc *)',
    ], { capturar: true });
    decir(`Claude:\n${salida.trim()}`);
    if (correr('git', ['rev-parse', 'HEAD'], { capturar: true }) === antes) throw new Error('Claude terminó sin commitear.');
  } finally {
    if (ramaOriginal && ramaOriginal !== rama) correr('git', ['switch', ramaOriginal]);
  }
}

// --- Principal ---------------------------------------------------------------------------------

const archivos = op.local ? archivosLocales() : archivosEnDrive();
const { porFecha, ignorados } = agruparPorFecha(archivos);
if (ignorados.length && !op.local) console.log(`Se ignoran (otro nombre): ${ignorados.join(', ')}`);

const ahora = new Date();
const espera = Number(op.espera);
const filas = [...porFecha]
  .filter(([fecha]) => !op.fecha || fecha === op.fecha)
  .map(([fecha, audios]) => ({ fecha, audios, estado: estadoDeFecha(audios, procesados(fecha), ahora, espera) }));

if (!filas.length) {
  console.log(op.fecha ? `No hay audios para ${op.fecha}.` : 'No hay audios.');
  process.exit(0);
}
for (const { fecha, audios, estado } of filas) {
  console.log(`${fecha}  ${estado.padEnd(10)} ${audios.map((a) => a.nombre).join(', ')}`);
}
if (op.listar) process.exit(0);

// Con --fecha no se espera; lo ya procesado solo se pisa con --forzar.
const aProcesar = filas.filter(({ estado }) =>
  estado === 'lista' || (op.fecha && estado === 'esperando') || (op.forzar && (estado === 'procesada' || estado === 'cambio')),
);
for (const { fecha, estado } of filas) {
  if (estado === 'cambio' && !op.forzar) {
    console.log(`${fecha}: llegaron audios nuevos después de procesar. Revisá y corré con --fecha ${fecha} --forzar.`);
  }
}
if (!aProcesar.length) process.exit(0);

tomarLock();
let fallas = 0;
for (const { fecha, audios } of aProcesar) {
  mkdirSync(`sesiones/${fecha}`, { recursive: true });
  log = `sesiones/${fecha}/auto.log`;
  decir(`=== ${fecha}: ${audios.length} audio(s) ===`);
  try {
    if (!op.local) bajar(fecha, audios);
    transcribir(fecha, audios);
    if (op['sin-claude']) {
      decir('Sin Claude: queda la transcripción cruda.');
      continue;
    }
    generarInsights(fecha);
    writeFileSync(
      `sesiones/${fecha}/procesado.json`,
      JSON.stringify({ audios: audios.map((a) => a.nombre), fecha: new Date().toISOString() }, null, 1),
    );
    decir(`Listo. Revisá feat/sesion-${fecha} y confirmá el push.`);
  } catch (e) {
    fallas++;
    decir(`ERROR: ${e.message}`);
  }
}
process.exit(fallas ? 1 : 0);
