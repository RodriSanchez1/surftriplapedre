// Genera public/avatars/<id>.svg para cada surfista que todavía no tenga avatar.
// Uso: npm run avatars   (para regenerar uno, borrar su archivo y volver a correrlo)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createAvatar } from '@dicebear/core';
import { adventurer } from '@dicebear/collection';
import { load } from 'js-yaml';

const surfistas = load(readFileSync('src/data/surfistas.yaml', 'utf8'));
mkdirSync('public/avatars', { recursive: true });

for (const { id, nombre } of surfistas) {
  const out = `public/avatars/${id}.svg`;
  if (existsSync(out)) {
    console.log(`= ${out} (ya existe)`);
    continue;
  }
  const svg = createAvatar(adventurer, { seed: nombre, backgroundColor: ['ffd400', 'ff9e1b', 'fffaf0'] }).toString();
  writeFileSync(out, svg);
  console.log(`+ ${out}`);
}
