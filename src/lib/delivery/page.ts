/**
 * delivery/index.html: a local page, opened from disk, to send each surfer their WeTransfer link by WhatsApp.
 * Built by scripts/deliver.mjs. Approved design: canvas "Surftrip: UI de la app", page "Entrega a los surfistas".
 * It only imports ../i18n.ts and ./message.ts, with the extension so Node can run it.
 */
import { format, t, type Lang } from '../i18n.ts';
import { formatSize, overLimit, TRANSFER_LINK, WHATSAPP } from './message.ts';

export interface PageCard {
  id: string;
  name: string;
  /** Color name from surfers.yaml: red | sky | yellow | green | pink. */
  color: string;
  waves: number;
  bytes: number;
  /** The surfer's folder as the organizer sees it (a Windows path on WSL). */
  path: string;
  /** The WhatsApp message, with '{transfer}' still in it. */
  message: string;
}

export interface PageInput {
  lang: Lang;
  /** Talk date, 'YYYY-MM-DD'. Keys what the browser remembers. */
  date: string;
  trip: string;
  /** 'jueves 29/10'. */
  day: string;
  cards: PageCard[];
  /** Names of the roster surfers with no waves that day. */
  without: string[];
  limitGb: number;
  /** tokens.css, global.css and the @font-face rules, inlined. */
  css: string;
}

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITIES[c]);

/** JSON inside <script type="application/json">: '<' is escaped so the data cannot close the tag. */
const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const PAGE_CSS = `
.delivery { display: flex; flex-direction: column; gap: var(--s-5); padding-top: var(--s-6); padding-bottom: var(--s-6); }
.delivery header { display: flex; flex-direction: column; gap: var(--s-1); }
.delivery header p { margin: 0; }
.kicker { font: 14px/1.2 var(--font-strong); }
.delivery h1 { margin: 0; font: 44px/1.1 var(--font-display); font-weight: 400; }
.delivery .notice { margin: 0; }
.steps { margin: 0; padding-left: calc(var(--s-5) + var(--s-4)); display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--s-3) var(--s-5); font-size: 14px; line-height: 1.4; }
.steps li { margin: 0; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(420px, 100%), 1fr)); gap: var(--s-5); }
.card { display: flex; flex-direction: column; gap: var(--s-3); padding: var(--s-4); background: var(--c-paper); border: var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.card-head { display: flex; align-items: center; gap: var(--s-3); }
.card h2 { margin: 0; flex: 1; font: 22px/1.2 var(--font-head); font-weight: 400; }
.dot { flex: none; width: 28px; height: 28px; border: var(--border); border-radius: 999px; background: var(--accent); }
.size { font: 14px/1.2 var(--font-strong); }
.size.over { padding: 2px var(--s-2); color: var(--c-white); background: var(--c-red); border: var(--border); border-radius: 999px; }
.card .notice { margin: 0; background: var(--c-white); font-size: 14px; line-height: 1.4; }
.path { display: flex; align-items: center; gap: var(--s-2); }
.path code { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: var(--s-2) var(--s-3); background: var(--c-white); border: var(--border); border-radius: var(--radius); font-size: 13px; }
.link { display: flex; flex-direction: column; gap: var(--s-1); font: 14px/1.2 var(--font-strong); }
.link input { min-height: 44px; padding: var(--s-2) var(--s-3); font: 15px/1.2 var(--font-body); background: var(--c-white); border: var(--border); border-radius: var(--radius); }
.link input[aria-invalid='true'] { border-color: var(--c-red); }
.help { font: 13px/1.3 var(--font-body); color: var(--c-muted); }
.card details { font-size: 14px; line-height: 1.5; }
.card summary { cursor: pointer; font: 14px/1.2 var(--font-strong); }
.message { margin: var(--s-2) 0 0; padding: var(--s-2) var(--s-3); white-space: pre-line; overflow-wrap: anywhere; background: var(--c-white); border: var(--border-w) dashed var(--c-ink); border-radius: var(--radius); }
.actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--s-3); flex-wrap: wrap; }
.sent { display: inline-flex; align-items: center; gap: var(--s-2); margin-right: auto; font: 14px/1.2 var(--font-strong); }
.sent svg { color: var(--c-green); }
.without { margin: 0; font-size: 14px; }
`;

const SCRIPT = `
const data = JSON.parse(document.getElementById('delivery-data').textContent);
const pattern = new RegExp(data.pattern);
const pad = (n) => String(n).padStart(2, '0');
const storageKey = (id) => 'surftrip-delivery:' + data.date + ':' + id;
function load(id) {
  try { return JSON.parse(localStorage.getItem(storageKey(id)) || '{}'); } catch { return {}; }
}
function save(id, state) {
  try { localStorage.setItem(storageKey(id), JSON.stringify(state)); } catch {}
}
for (const card of document.querySelectorAll('[data-card]')) {
  const id = card.dataset.card;
  const info = data.cards[id];
  const input = card.querySelector('[data-link]');
  const help = card.querySelector('[data-help]');
  const send = card.querySelector('[data-send]');
  const sent = card.querySelector('[data-sent]');
  const message = card.querySelector('[data-message]');
  const copy = card.querySelector('[data-copy]');
  let state = load(id);
  const text = () => info.message.replace('{transfer}', input.value.trim() || '…');
  function render() {
    const link = input.value.trim();
    const valid = pattern.test(link);
    input.setAttribute('aria-invalid', String(link !== '' && !valid));
    help.hidden = link === '' || valid;
    send.disabled = !valid;
    message.textContent = text();
    if (state.sentAt) {
      const d = new Date(state.sentAt);
      card.querySelector('[data-sent-text]').textContent = data.strings.sent
        .replace('{date}', pad(d.getDate()) + '/' + pad(d.getMonth() + 1))
        .replace('{time}', pad(d.getHours()) + ':' + pad(d.getMinutes()));
    }
    sent.hidden = !state.sentAt;
    send.textContent = state.sentAt ? data.strings.resend : data.strings.send;
    send.classList.toggle('primary', !state.sentAt);
  }
  input.value = state.link || '';
  input.addEventListener('input', () => {
    state = Object.assign({}, state, { link: input.value.trim() });
    save(id, state);
    render();
  });
  send.addEventListener('click', () => {
    window.open(data.whatsapp + encodeURIComponent(text()), '_blank', 'noopener');
    state = Object.assign({}, state, { sentAt: new Date().toISOString() });
    save(id, state);
    render();
  });
  copy.addEventListener('click', async () => {
    const label = copy.textContent;
    try {
      await navigator.clipboard.writeText(info.path);
      copy.textContent = data.strings.copied;
      setTimeout(() => { copy.textContent = label; }, 1500);
    } catch {
      getSelection().selectAllChildren(card.querySelector('code'));
    }
  });
  render();
}
`;

const CHECK =
  '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" ' +
  'stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"></path></svg>';

function card(c: PageCard, input: PageInput): string {
  const { lang } = input;
  const over = overLimit(c.bytes, input.limitGb);
  const waves = c.waves === 1 ? t(lang, 'delivery.wave') : format(t(lang, 'delivery.waves'), { n: c.waves });
  const help = `help-${esc(c.id)}`;
  return `<article class="card" data-card="${esc(c.id)}" style="--accent: var(--c-${esc(c.color)})">
<div class="card-head"><span class="dot" aria-hidden="true"></span><h2>${esc(c.name)}</h2><span class="size${over ? ' over' : ''}">${esc(waves)} · ${formatSize(c.bytes, lang)}</span></div>
${over ? `<p class="notice error">${esc(format(t(lang, 'delivery.overLimit'), { limit: input.limitGb }))}</p>` : ''}
<div class="path"><code>${esc(c.path)}</code><button type="button" class="btn small" data-copy>${esc(t(lang, 'delivery.copyPath'))}</button></div>
<label class="link">${esc(t(lang, 'delivery.link'))}<input type="url" inputmode="url" autocomplete="off" placeholder="https://we.tl/…" data-link aria-describedby="${help}"><span class="help" id="${help}" data-help hidden>${esc(t(lang, 'delivery.linkHelp'))}</span></label>
<details><summary>${esc(t(lang, 'delivery.preview'))}</summary><p class="message" data-message></p></details>
<div class="actions"><span class="sent" data-sent hidden>${CHECK}<span data-sent-text></span></span><button type="button" class="btn primary" data-send disabled>${esc(t(lang, 'delivery.send'))}</button></div>
</article>`;
}

export function deliveryPage(input: PageInput): string {
  const { lang } = input;
  const title = t(lang, 'delivery.title');
  const day = capitalize(input.day);
  const waves = input.cards.reduce((n, c) => n + c.waves, 0);
  const steps = (['delivery.step1', 'delivery.step2', 'delivery.step3', 'delivery.step4'] as const)
    .map((key) => `<li>${esc(t(lang, key))}</li>`)
    .join('');
  const data = {
    date: input.date,
    pattern: TRANSFER_LINK.source,
    whatsapp: WHATSAPP,
    strings: {
      send: t(lang, 'delivery.send'),
      resend: t(lang, 'delivery.resend'),
      sent: t(lang, 'delivery.sent'),
      copied: t(lang, 'delivery.copied'),
    },
    cards: Object.fromEntries(input.cards.map((c) => [c.id, { path: c.path, message: c.message }])),
  };
  const without = input.without.length
    ? `<p class="without">${esc(format(t(lang, 'delivery.without'), { names: input.without.join(', ') }))}</p>`
    : '';
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(`${title} · ${day}`)}</title>
<style>
${input.css}
${PAGE_CSS}
</style>
</head>
<body>
<main class="wrap delivery">
<header>
<p class="kicker">${esc(input.trip)} · ${esc(title)}</p>
<h1>${esc(day)}</h1>
<p>${esc(format(t(lang, 'delivery.summary'), { surfers: input.cards.length, waves }))}</p>
</header>
<p class="notice warn"><strong>${esc(t(lang, 'delivery.publishFirst'))}</strong> ${esc(t(lang, 'delivery.publishFirstText'))}</p>
<ol class="prose steps">${steps}</ol>
<div class="cards">
${input.cards.map((c) => card(c, input)).join('\n')}
</div>
${without}
</main>
<script type="application/json" id="delivery-data">${json(data)}</script>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
