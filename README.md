# Surftrip La Pedrera

Sitio del surftrip a La Pedrera (24/10 al 1/11/2026) con el coach Douglas Cominski: calendario del trip, foco de cada surfista y análisis de cada sesión, en español y portugués.

**Link:** https://rodrisanchez1.github.io/surftriplapedre/ (en portugués: `/pt/`). Se puede ver sin cuenta y no aparece en buscadores.

## Correrlo en local

```
nvm use
npm install
npm run dev
```

Abrir http://localhost:4321/surftriplapedre/. El catálogo del design system está en `/design/`.

## Cómo se trabaja

El proyecto se desarrolla con IA. El workflow, las reglas y las recetas (cargar una sesión, agregar un surfista, cambiar el calendario) están en [AGENTS.md](AGENTS.md).

Cada push a `main` publica el sitio con GitHub Actions.

## Privacidad

Los audios, los videos y las transcripciones completas de las sesiones quedan solo en local y no se suben al repo.
