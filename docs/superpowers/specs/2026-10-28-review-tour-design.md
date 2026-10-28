# Video review tour: design

**Date:** 2026-10-28
**Status:** approved in conversation (brainstorming, 2026-10-28)
**Design:** page "Análisis de video: tour" of the canvas [Surftrip: UI de la app](https://claude.ai/artifact/Skns4rC61JnapAUv48tScm) (20 steps: laptop and phone), on the [Board Graphic](https://claude.ai/artifact/Pyi9YKiEivhnfXRAZju7kk) design system.

## Goal

The coach and the organizer learn to use `/review/` without help. A guided tour points at the real controls, one at a time, with a short explanation. It starts by itself the first time and can be replayed.

## Decisions

| Topic | Decision |
|---|---|
| When | It starts by itself the first time, and the device remembers it. A **"?" button** in the top bar replays it. |
| Two parts | The drawing tools, the timeline and the capture dock are hidden until a clip loads, so the tour has two parts. **Part 1** starts on entry, with no videos. **Part 2** starts by itself the first time a clip is ready. Each part is remembered separately. |
| "?" | It replays the part that matches the screen: part 2 when a clip is ready, part 1 otherwise. |
| Look | The rest of the screen dims, with the target cut out and a yellow ring (`--c-yellow`). Beside it sits a paper card (`--c-paper`, `--border`, `--radius`, `--shadow`) with a kicker "Parte N · Paso X de Y", progress dots, a title (`--font-strong` 20px), one or two lines of body text, a **Saltar** link, **Atrás** (`.btn`, not on a part's first step) and the main button (`.btn.primary`). |
| Card position | **Laptop:** next to the target, trying right, then left, below and above, and kept inside the screen. **Phone** (the editor's compact layout): a full-width sheet at the bottom, or at the top when the target sits in the lower half. The welcome card is centered. |
| One modal at a time | While the welcome card is open, the empty-state card ("Elegir carpeta de videos") is hidden. It comes back for step 3, which points at it. |
| On top of everything | The tour sits above every card, popover, drawer and toast of the editor. It is a `<dialog>` opened with `showModal()`, so it lives in the browser's top layer (no z-index race) and the rest of the page is inert. Opening it puts away the recording popover and, on a phone, the clip drawer, unless a step needs the drawer open. |
| Language | Every string goes in `src/lib/i18n.ts`, in es and pt. Nothing about the trip is written into the code. |

## Steps

The canvas has the final Spanish copy, the same as below; pt is a translation of it. On the phone, steps 5 and 6 have their own copy.

**Part 1, on entry (no clips)**

| # | Target | Title | Text |
|---|---|---|---|
| 1 | none (centered) | Así se analiza un video | Mirás los clips de la sesión, pausás en una ola, dibujás encima y guardás la captura para cada surfista. Los videos se reproducen desde este dispositivo: no se suben a ningún lado. · button **Empezar** |
| 2 | session select | Elegí la sesión | Es el día que estás analizando. Las capturas y el audio quedan asociados a esa fecha. |
| 3 | empty-state card (else the bar's folder or files button) | Abrí la carpeta de videos | Elegí la carpeta con los clips del día. En Chrome y Edge queda recordada para la próxima vez; en otros navegadores elegís los videos uno por uno. |
| 4 | record button | Grabá la charla (si hace falta) | Si nadie graba el audio con un celular en la página de subida, grabalo acá. Todo se alinea por la hora del dispositivo. · note: "Elegí la carpeta y seguimos cuando cargue el primer clip." · button **Entendido** |

**Part 2, the first time a clip is ready**

| # | Target | Title | Text |
|---|---|---|---|
| 5 | clip list (phone: the ☰ button) | Tus clips | Ordenados por la hora de filmación. ≈ es una hora aproximada y tachado, un clip que el navegador no puede reproducir (exportalo como MP4 H.264). La tecla L muestra u oculta la lista. · phone: ☰ abre la lista de clips, ordenados por la hora de filmación. ≈ es una hora aproximada y tachado, un clip que el navegador no puede reproducir. |
| 6 | transport | Reproducí y frená en la ola | Espacio reproduce o pausa, ← → avanzan cuadro a cuadro y ⇧ + ← → saltan 5 segundos. Bajá la velocidad para ver bien la maniobra. · phone: ▶ reproduce o pausa y \|◀ ▶\| avanzan cuadro a cuadro. Con el botón de velocidad la bajás para ver bien la maniobra. |
| 7 | drawing rail | Dibujá sobre el cuadro | Con el video en pausa elegí lápiz, flecha o círculo y el color. ↶ deshace, ⌫ borra y 📌 deja el dibujo fijo aunque sigas reproduciendo. |
| 8 | surfer chips | ¿De quién es la ola? | Tocá a los surfistas que aparecen en el cuadro. La captura queda guardada para cada uno. |
| 9 | capture row and captures strip | Guardá la captura | Guarda el cuadro con el dibujo. Aparece en la tira de capturas: tocala para volver a ese momento o borrala con ✕. |
| 10 | discard + finish buttons | Terminá y subí | Sube el registro y las capturas a Drive para armar los insights. 🗑 descarta lo que no subiste. Este tour se repite con el botón ?. · button **Listo** |

The "?" button: `aria-label`/`title` "Ver cómo se usa".

## Behavior

- **Remembered:** two local flags, one per part. Finishing a part or pressing Saltar marks only that part as seen, so part 2 still shows once after part 1 was skipped, because its tools are new. The "?" button ignores the flags. If storage fails, the tour simply starts again next time.
- **When it waits:** never under the Google login gate (`data-signed-in="false"`). It starts once the coach signs in, or right away when Drive is not configured. If a clip becomes ready while part 1 is open, part 2 waits until part 1 closes. A clip that fails to play does not start part 2; the next clip that is ready does. Restoring an unfinished analysis is not a special case: the same flags and the same "clip ready" rule apply.
- **Missing target:** a step whose target is missing or has no size (e.g. a hidden button) is skipped. The step count shows the steps actually shown.
- **While open:** the dimmed area catches clicks (they do nothing), and the editor's keyboard shortcuts are off. **Esc** acts like Saltar. The card is a `role="dialog"` with `aria-modal="true"`, labelled by its title. Focus goes to the main button, Tab stays inside the card, and on close focus returns to whatever had it before (the "?" button when replayed).
- **Layout changes:** on resize, orientation change, the clip drawer opening or closing, or fullscreen, the spotlight and card are placed again. In immersive mode the bar is hidden, so the "?" button is too; a tour already open closes when immersive mode starts.
- **Motion:** at most a short fade, and none under `prefers-reduced-motion`.

## Structure

- `src/lib/review/tour.ts`: pure, tested logic. It holds the step list (part, step id, target selectors for wide and compact, i18n keys, phone-specific keys), which part to start for a given state, the card position (target box, card size, viewport, compact → x/y/side), and reading and writing the "seen" flags through an injected storage.
- `src/lib/review/tour-page.ts`: the DOM controller, started by `page.ts` `init`. It watches `data-view`, `data-signed-in` and `data-has-clips`, opens and closes the overlay, measures targets and wires the buttons and Esc. It talks to `page.ts` through the root's data attributes and one small hook to turn shortcuts off.
- `src/components/TourOverlay.astro`: the overlay markup and styles (tokens only), rendered by `VideoReview.astro`. It gets its texts the same way as the rest of the editor (`data-texts`).
- `VideoReview.astro`: the "?" button in the bar, before the record button, plus a root attribute that hides the empty-state card during the welcome step.
- `/design/`: the overlay shown over the `VideoReview` demo on one step (static, like the other demos), per AGENTS.md rule 3.

## Testing

- Vitest (`tests/tour.test.ts`): which part to start (signed in or not, flags, clip ready, part 1 open), card position (each side, falling back and clamping, phone top or bottom, centered with no target), steps with missing targets dropped and the count recalculated, and the flags when storage is missing or throws.
- `npm run check && npm test && npm run build`, then `npm run shots` of `/review/` and `/design/` at 390 px and 1280 px, looked at for the steps.

## Out of scope

A tour for other pages, analytics, a "don't show again" checkbox (Saltar is that), animated arrows or pointers, and adding the "?" button to the other canvas screens. That last one is a design-file chore, not part of this feature.
