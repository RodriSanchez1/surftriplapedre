# Surftrip La Pedrera

Site for the surftrip to La Pedrera (Oct 24 to Nov 1, 2026) with coach Douglas Cominski: the trip calendar, each surfer's focus and an analysis of each session, in Spanish and Portuguese.

**Link:** https://rodrisanchez1.github.io/surftriplapedre/ (Portuguese: `/pt/`). Anyone can view it without an account, and it does not show up in search engines.

## Run it locally

```
nvm use
npm install
npm run dev
```

Open http://localhost:4321/surftriplapedre/. The design system catalog is at `/design/`.

## How the work is done

The project is developed with AI. The workflow, rules and recipes (loading a session, adding a surfer, changing the calendar) are in [AGENTS.md](AGENTS.md).

Every push to `main` publishes the site with GitHub Actions.

## Privacy

Audio, video and full session transcripts stay local and are never pushed to the repo.
