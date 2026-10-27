// Generates public/avatars/<id>.svg for every surfer and coach that does not have an avatar yet.
// Usage: npm run avatars   (to regenerate one, delete its file and run it again)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createAvatar } from '@dicebear/core';
import { adventurer } from '@dicebear/collection';
import { load } from 'js-yaml';

const people = ['surfers', 'coaches'].flatMap((f) => load(readFileSync(`src/data/${f}.yaml`, 'utf8')));
mkdirSync('public/avatars', { recursive: true });

for (const { id, name } of people) {
  const out = `public/avatars/${id}.svg`;
  if (existsSync(out)) {
    console.log(`= ${out} (already exists)`);
    continue;
  }
  const svg = createAvatar(adventurer, { seed: name, backgroundColor: ['ffd400', 'ff9e1b', 'fffaf0'] }).toString();
  writeFileSync(out, svg);
  console.log(`+ ${out}`);
}
