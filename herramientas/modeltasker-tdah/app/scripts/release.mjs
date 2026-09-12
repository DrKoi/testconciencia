import { copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '..', '..', 'dist', 'index.html');
const target = resolve(here, '..', '..', 'index.html');

copyFileSync(source, target);
console.log(`Copiado ${source} -> ${target}`);
