// Cross-platform: kopiert alle .sql-Dateien aus src/db/migrations/sql nach
// dist/db/migrations/sql, damit der Migration-Runner sie nach tsc-Build findet.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '..', 'src', 'db', 'migrations', 'sql');
const DEST = path.resolve(here, '..', 'dist', 'db', 'migrations', 'sql');

mkdirSync(DEST, { recursive: true });

let count = 0;
for (const file of readdirSync(SRC)) {
  if (!file.endsWith('.sql')) continue;
  copyFileSync(path.join(SRC, file), path.join(DEST, file));
  count++;
}

console.log(`[copy-sql] ${count} SQL file(s) -> ${DEST}`);
