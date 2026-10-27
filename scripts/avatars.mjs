// Generates public/avatars/<id>.svg for every surfer that does not have an avatar yet.
// Usage: npm run avatars   (to regenerate one, delete its file and run it again)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createAvatar } from '@dicebear/core';
import { adventurer } from '@dicebear/collection';
import { load } from 'js-yaml';

const surfers = load(readFileSync('src/data/surfers.yaml', 'utf8'));
mkdirSync('public/avatars', { recursive: true });

for (const { id, name } of surfers) {
  const out = `public/avatars/${id}.svg`;
  if (existsSync(out)) {
    console.log(`= ${out} (already exists)`);
    continue;
  }
  const svg = createAvatar(adventurer, { seed: name, backgroundColor: ['ffd400', 'ff9e1b', 'fffaf0'] }).toString();
  writeFileSync(out, svg);
  console.log(`+ ${out}`);
}
