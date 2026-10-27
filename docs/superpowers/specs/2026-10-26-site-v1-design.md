# Surftrip site v1: design

**Date:** 2026-10-26
**Status:** draft, pending review

## Goal

Give the surftrip participants a page to check before getting in the water: what happens each day, what each person should think about, and what Douglas said in each session. The first version has to be published during the trip (Oct 24 to Nov 1, 2026).

The same work documents the process for developing the project with AI in `AGENTS.md`.

## Scope

**In v1**

- Static Astro site, published on GitHub Pages with GitHub Actions.
- Home with the trip info, a 9-day calendar and the team roster.
- A page per coach session and a page per surfer.
- Spanish at the root and Portuguese under `/pt/`.
- "Board Graphic" design system, with tokens, components and a reference page.
- Migration of the Oct 26 session content.
- `AGENTS.md` with the development workflow.

**Out**

- Recording the coach's audio from the app. That is Phase 2 and will have its own spec. v1 does not block it: Astro can add a server endpoint with an adapter.
- Real photos of the participants. Generated avatars are used.
- Accounts, login or editing from the browser.
- Full transcripts stay local only, as they are today.

## Pages

| Route | Content |
|---|---|
| `/` | Hero (trip name, La Pedrera, 24/10 → 1/11, coach Douglas Cominski), calendar and roster grid |
| `/sessions/YYYY-MM-DD/` | Summary, each surfer's insights, plan for the next session and logistics |
| `/surfers/<id>/` | Avatar and name, current focus (main, secondary and cue from the last session) and their insights per session, newest first |
| `/design/` | Design system reference: tokens and each component in its states. Not in the navigation |
| `/pt/...` | The same pages in Portuguese, except `/design/` |

Navigation: the header has the brand, which links to the home, and the ES/PT switcher, which keeps the current page. Each roster card links to its surfer. Each day with a session links to its session.

**Compatibility:** the current URL with `?lang=pt` redirects to `/pt/` through a minimal script on the home page, so the link Douglas already has keeps working.

## Calendar

- One cell per day, from Saturday 10/24 to Sunday 11/1, with the weekday and the date.
- Each cell shows the day's activity loaded in `days.yaml`. If a day has nothing loaded, it shows "Sin plan".
- There are four visual states: **normal**, **with a coach session** (links to `/sessions/<date>/`), **today** and **past**, which is dimmed.
- "Today" is computed in the browser using Uruguay time (`America/Montevideo`), because the site is static and the build does not know which day it is being viewed. Without JavaScript no day is highlighted and everything else works the same.
- On mobile, the calendar is a horizontally scrolling row that starts centered on today.

## Content model

```
src/data/trip.yaml              id, name, team, location, coach, startDate, endDate, timeZone
src/data/days.yaml              list: id (the date), activity {es, pt?}, spot?, time?, session?: YYYY-MM-DD
src/data/surfers.yaml           list: id, name, color (red | sky | yellow | green | pink)
src/content/sessions/YYYY-MM-DD.es.md
    frontmatter: date, title, planNote?, logistics[]
    body: the summary
src/content/sessions/YYYY-MM-DD.pt.md
src/content/insights/YYYY-MM-DD/<id>.es.md
    frontmatter: date, surfer, focus, secondaryFocus, cue
    body: intro, "### Lo que salió bien" and "### En qué trabajar"
src/content/insights/YYYY-MM-DD/<id>.pt.md
public/avatars/<id>.svg         the name comes from the surfer's id
```

- Each Astro collection has a zod schema. If a required field is missing, if a `surfer` does not exist in `surfers.yaml`, or if a `session` in `days.yaml` has no file, the build fails.
- If the `.pt` version of a file is missing, the Portuguese page shows the Spanish text with the label "Tradução pendente". Publishing is not blocked by a translation.
- Each session's plan table is built from the insights' frontmatter, so it is not written twice.
- The roster is shown in alphabetical order by name.
- `scripts/import-session.mjs` converts `sessions/<date>/insights-<lang>.md` (the format the Oct 26 insights were written in) into these files. It is used for the migration and to load future sessions.
- To add a participant, add an entry to `surfers.yaml` and run `npm run avatars`. Avatars are DiceBear SVGs (`adventurer` style), generated once with the name as the seed and stored in the repo, so the site does not depend on an API at runtime.
- `days.yaml` starts with what is already known: the analyzed session of Oct 26. The team fills in the other days.

## Project rule: reusable for future surftrips

The repo has to be usable for another surftrip by changing only data and content, without touching components or pages. v1 does not build support for several trips at once (no selector, no per-trip routes), but nothing is done that would prevent it:

- **Nothing trip-specific in the code.** Names, dates, location, coach, number of days and team name come from `src/data/` or `src/content/`. This includes the header brand ("Team Pedrera"), which is read from `trip.yaml`.
- **The calendar is built from `startDate` and `endDate`** and does not assume the trip lasts 9 days.
- **Fixed UI strings** ("Lo que salió bien", "Sin plan", etc.) go in an i18n dictionary and are not repeated in components.
- **The design system belongs to the project, not the trip.** If a future trip wants another palette, the tokens change.

How growth is expected, without doing it now: move the content to `src/content/trips/<trip-id>/` and generate `/<trip-id>/...` per trip. The rule above is what makes that change cheap. It is written in `AGENTS.md` as a project rule.

## Design system: "Board Graphic"

Inspired by 80s surfboards and surf graphics, using the references in `assets/references/`. It takes the style, not the brand: the own name is **Team Pedrera** and the bolt is a generic drawing of our own. The Lightning Bolt name and logo are not used.

**Tokens** (CSS variables in `src/styles/tokens.css`)

| Token | Value | Use |
|---|---|---|
| `--c-orange` | `#ff9e1b` | General background |
| `--c-red` | `#e4261c` | Hero band, accents |
| `--c-yellow` | `#ffd400` | Calendar cells, names on black |
| `--c-ink` | `#111111` | Text, borders, dark cards |
| `--c-paper` | `#fffaf0` | Background of long-reading blocks |
| `--c-sky` | `#1aa7ff` | Secondary accent, links |
| `--c-white` | `#ffffff` | Text on red or black |
| `--c-muted` | `#5c4a36` | Secondary text on yellow or paper |
| `--c-green`, `--c-pink` | `#2bb34a`, `#ff4f9a` | Extra surfer accents, along with red, sky and yellow |
| `--border` | `3px solid var(--c-ink)` | Standard border |
| `--radius` | `8px` | Radius of cards and cells |
| Spacing | `--s-1` 4px … `--s-6` 48px | Scale of 4 |

Each surfer has an accent color taken from the palette. It is used on the bottom border of their card and in the header of their page.

**Typography**, served locally with `@fontsource`, not requested from Google Fonts:

- `Bungee Shade`: hero title and the surfer's name on their page.
- `Bungee`: headings, labels and names in the roster.
- `Archivo Black`: subtitles and highlighted data, such as dates and focus.
- `system-ui`: body text, at 16 px minimum.

**Readability:** long text, such as insights and the summary, goes on `--c-paper` with `--c-ink` text, not directly on the orange. Text and background combinations meet WCAG AA contrast.

**Components** (`src/components/`)

| Component | What it does |
|---|---|
| `BaseLayout` | Base HTML, `noindex` meta, fonts, tokens, header and footer |
| `SiteHeader` | Team brand (from `trip.yaml`, currently "⚡ TEAM PEDRERA") and ES/PT switcher |
| `BoltBand` | Red band with a bolt-shaped cut, for the hero and page headers |
| `TripCalendar` / `DayCell` | Calendar with its four states |
| `SurferCard` | Avatar, name and main focus, on a black card with a colored bottom border |
| `Avatar` | Round avatar with a yellow ring, in three sizes |
| `FocusBlock` | Main focus, secondary focus and cue for the water |
| `InsightBlock` | Reading block on paper with "Lo que salió bien" and "En qué trabajar" |
| `TranslationBadge` | "Tradução pendente" label |

`/design/` shows every token and every component in all its states. Agents use it to verify visual changes and as a catalog before creating a new component.

## Deploy

- `astro.config.mjs` with `site: https://rodrisanchez1.github.io` and `base: /surftriplapedre`.
- Node 24 (`.nvmrc`), because Astro 7 requires Node ≥ 22.23.
- `.github/workflows/deploy.yml` runs tests, check and build on every PR, and on every push to `main` it also publishes with `withastro/action` and `actions/deploy-pages`.
- In GitHub, Pages has to be switched from "Deploy from a branch" to "GitHub Actions". This is done only once the first build passes in CI, so the current page stays online in the meantime.
- The current `index.html` is replaced by the new site once the Oct 26 migration is verified.

## Verification

- `astro check` and `astro build` run in CI before the deploy. If they fail, nothing is published.
- Vitest tests for the logic with rules: each day's state (past, today, session), building a surfer's insights sorted by date, and the translation fallback.
- Before closing a visual task, screenshots of `/`, a session, a surfer and `/design/` at a phone width (390 px) and a desktop width.
- For the Oct 26 migration, check that every insight in `sessions/2026-10-26/insights-*.md` appears in the new site. Since each insight cites a minute, it is enough to check that all the minutes are there.
- Screenshots come from `scripts/shots.mjs` (Playwright).

## AI development workflow (`AGENTS.md`)

`AGENTS.md` at the repo root is the main source for any agent. `CLAUDE.md` only imports it (`@AGENTS.md`). Contents:

1. **Project context:** what it is, who takes part, languages (ES and PT) and which content is private (audio, video and transcripts are never pushed).
2. **Repo map:** where each thing lives according to the content model above.
3. **Workflow with the superpowers skills:**
   - **Define (back and forth with the human):** `brainstorming` → spec in `docs/superpowers/specs/` → `writing-plans` → plan in `docs/superpowers/plans/`. This step uses the main model.
   - **Execute:** `subagent-driven-development`, with one plan task per subagent. Each task says which model to use:
     - **Haiku:** mechanical tasks with closed instructions, such as loading a day in `days.yaml`, adding a surfer or moving content that is already written.
     - **Sonnet:** components, pages, tests, translating to Portuguese and loading a new session from the transcript.
     - **Opus (main model):** design, plans, final review and any task with open decisions.
   - **Close:** `verification-before-completion` with build, tests and screenshots, then `requesting-code-review` and finally `finishing-a-development-branch`.
4. **"Load a new session" recipe:** exact steps from the audio to the push, so a cheap subagent can follow it without asking.
5. **Rules:** the repo is reusable for future surftrips (see the section above: nothing trip-specific in the code), commits in English, a branch per feature, no pushing or changing GitHub settings without confirmation, respect the existing tokens and components, and check `/design/` before creating a new one.

`README.md` is for humans: what the site is, the link and how to run it locally. The workflow section moves to `AGENTS.md`.

## Decisions made

- Astro instead of plain HTML without a build, to have a single content source and a design system in components.
- Trip day calendar (option A), with no forecast or detailed agenda.
- Surfer page with profile, current focus and history (option A), with no evolution timeline.
- Visual direction C, "Board Graphic".
- Generated avatars until there are photos.
- Reusable repo for future surftrips as a rule, with no multi-trip support in v1.
