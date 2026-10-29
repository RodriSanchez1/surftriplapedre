# Screens catalog: design

**Date:** 2026-10-29
**Status:** approved in conversation (brainstorming, 2026-10-29).

## Goal

See every screen of the site, in every state, on a phone and a laptop, rendered by the real code. It replaces hand-made copies of screens in the Claude Design canvas: copies go stale as soon as the code changes, and keeping them up to date is slow and expensive. The canvas stays only for proposing new designs, which start from screenshots of this catalog.

## Decisions

| Topic | Decision |
|---|---|
| Approach | One route per state that renders the real page (layout, header, view) with a fixed `demo` state, and a catalog page that shows those routes in iframes. Iframes give each frame its own viewport, so the phone media queries apply. Rejected: a Playwright script that clicks through the UI (breaks when the UI changes, images go stale) and more inline demos in `/design/` (no page chrome, no phone layout). |
| Scope | Every page of the site. Content pages with their real content; `/upload/` and `/review/` in each of their states. Content edge cases with fixture data (a day with no session, a surfer with no insights) are out of scope. |
| Language | Spanish only. Portuguese can be added later. |
| Sizes | Phone 390×844 and laptop 1280×800 for every screen. `/review/` also gets phone landscape 844×390. |
| Frozen | Interactive states are frozen, like the current `demo` in `/design/`: the page script leaves them alone. |
| Published | Like `/design/`: built and deployed, not linked from the navigation, `noindex` like the whole site. The catalog page is internal, so its labels are in English and are not i18n strings. |
| Source of truth | The code. The catalog is built from it, so it cannot go stale. |

## Screens and states

29 screens with the current data.

**Content**, one entry each, pointing at the real URL. The URL comes from the data, never from a name written in code (AGENTS.md rule 1):

| Screen | URL |
|---|---|
| Home | `/` |
| Session | the latest loaded session |
| Surfer | the first surfer in the roster |
| Coach | the first coach with a profile page (left out if there is none) |

**`/upload/`** (8): `login`, `ready`, `recording`, `cut`, `uploading`, `done`, `error` (the existing `demo` states of `AudioUploader`) and `unconfigured` (no `audio` in the trip).

**`/review/`**, the editor (8):

| State | What it shows |
|---|---|
| `login` | the Google login covering the screen |
| `empty` | no folder yet, the card to pick one |
| `loading` | a clip opening |
| `error` | a clip the browser cannot play |
| `ready` | a clip open, the clip list, no captures |
| `working` | arrow tool active, recording audio, 3 captures, the "capture tagged" toast (the current `demo`) |
| `restored` | an analysis restored, the session locked, the restored notice |
| `uploading` | uploading after Terminar |

**`/review/` tour** (9), one state per step of `STEPS` in `src/lib/review/tour.ts`, over the editor state that step runs on: `welcome`, `day`, `record`, `folder` over `empty`; `clips`, `play`, `draw`, `capture` over `ready`; `upload` over `working`. In demo mode the tour opens straight on that step and does not read or write what the device remembers.

## Architecture

**Screen registry** (`src/lib/screens.ts`, pure, with tests). The list of screens and their states. Each entry has an id (`review-working`), a group (Home, Session, Surfer, Coach, Upload, Review, Review tour), a one-line description, the URL that shows it and its sizes.

- Content entries take the ids they need (latest session, first surfer, first coach with a profile) as input and build the URL with `pathFor`.
- Interactive entries are **derived from the code, not listed again**: the `/upload/` states from the exported list of `AudioUploader` demo states, the `/review/` states from an exported list of `VideoReview` demo states, and the tour states from `STEPS`. Each demo state's description lives next to its preset.

**Demo states in the components.**

- `VideoReview`'s `demo` prop goes from `boolean | 'login'` to a named state (`ReviewDemo`). Each state has a preset in one place in the component: the data attributes, the visible parts and the fake contents. Typing the presets as `Record<ReviewDemo, Preset>` makes TypeScript fail when a state has no preset.
- A tour state is an editor state plus a step id. `tour-page.ts` gets a demo entry that opens the dialog on that step with no storage and no hooks.
- `AudioUploader` keeps its `demo` states; the list is exported so the registry can read it. `unconfigured` is the uploader with no `audio`.
- `ReviewView` and `UploadView` accept an optional `demo` and pass it to the component. Without it nothing changes on the real pages.
- `/design/` keeps working: its current `demo` and `demo="login"` become `demo="working"` and `demo="login"`.

**State routes** (`src/pages/design/screens/[screen]/[state].astro`). `getStaticPaths` comes from the interactive entries of the registry. Each route renders `ReviewView` or `UploadView` with the state, so the frame is the whole page.

**Catalog page** (`src/pages/design/screens/index.astro`).

- Same layout as `/design/`, and each page links to the other.
- Screens grouped as in the registry. Each state is a row with its name, its description and its frames side by side, scaled down with CSS, `loading="lazy"`.
- A frame shows what fits on the device's screen, not the full page. Each frame has an "open" link to see it full size. Each row has an anchor (`#review-working`) so a state can be linked.

**Screens list** (`src/pages/design/screens.json.ts`). Every entry with its URL and sizes, read by the screenshot script.

**Screenshots** (`scripts/shots-screens.mjs`, `npm run shots:screens -- <base-url> <folder> [screen-id ...]`). Reads `/design/screens.json` from the running site and saves one PNG per entry and size, e.g. `review-working-laptop.png`. With ids, only those screens. These are the images used in the canvas for a proposal.

## Kept up to date automatically

- **Interactive states come from the code.** A new tour step shows up in the catalog by itself. A new value in `ReviewDemo` or in the `AudioUploader` states fails `npm run check` until it has a preset, and then shows up.
- **New pages are caught by a test.** `src/lib/screens.test.ts` walks `src/pages/**/*.astro` (leaving out `pt/`, which mirrors the Spanish routes, and `design/`) and fails if a route pattern (`/sessions/[date]/`) has no entry in the registry. It runs with `npm test`, which is already part of "verify before saying done".
- Other tests: every entry has a unique id and a URL; tour states cover every step in `STEPS`.

## Documentation

- **AGENTS.md**
  - Rule 3: before designing, check `/design/screens/` as well as `/design/`. A new page or UI state goes into the catalog in the same branch.
  - Rule 6: after a visual change, check the affected screens in the catalog.
  - Rule 7, rewritten: the canvas is only for proposals, which start from catalog screenshots (`npm run shots:screens`). Screens are not copied or redrawn into the canvas. Board Graphic is still re-synced when `tokens.css` or `global.css` change.
  - Repo map, commands, and a new recipe: "Add a screen or state to the catalog".
- Doc comments in `screens.ts`, `VideoReview.astro` and `AudioUploader.astro` explaining how to add a state.
- The assistant's design-assets memory, so future sessions follow this model.

## Out of scope

- Portuguese frames.
- Content pages in edge states with fixture data.
- Updating the existing canvas pages: they stay as the record of past proposals.

## Risks

- PR #17 (clip tags) changes `VideoReview.astro`; merging both will need small conflict fixes around `demo`.
- Frozen states are built by hand from presets, so a preset can drift from what the live script would draw. Keeping presets next to the markup they set, and checking them in the catalog during review, limits that.
