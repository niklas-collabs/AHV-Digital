// Cross-platform: kopiert nicht-TS-Assets (SQL-Migrations + TTF-Fonts) aus
// src/ in die entsprechenden dist/-Verzeichnisse, damit der Server zur
// Laufzeit alles findet.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function copyDir(srcRel, destRel, exts) {
  const src = path.resolve(here, '..', 'src', ...srcRel.split('/'));
  const dest = path.resolve(here, '..', 'dist', ...destRel.split('/'));
  mkdirSync(dest, { recursive: true });
  let count = 0;
  for (const file of readdirSync(src)) {
    if (exts.length > 0 && !exts.some((e) => file.endsWith(e))) continue;
    copyFileSync(path.join(src, file), path.join(dest, file));
    count++;
  }
  return count;
}

const sqlCount = copyDir('db/migrations/sql', 'db/migrations/sql', ['.sql']);
console.log(`[copy-assets] ${sqlCount} SQL file(s) copied`);

const fontCount = copyDir('assets/fonts', 'assets/fonts', ['.ttf', '.txt']);
console.log(`[copy-assets] ${fontCount} font file(s) copied`);
