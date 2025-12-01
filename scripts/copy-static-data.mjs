import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

const mappings = [
  {
    from: path.join(projectRoot, 'src/data/avacy/json'),
    to: path.join(distDir, 'data/avacy/json'),
  },
  {
    from: path.join(projectRoot, 'src/data/avacy/md'),
    to: path.join(distDir, 'data/avacy/md'),
  },
];

async function copyTree(from, to) {
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to, { recursive: true });
  console.log(`[copy-data] Copiato ${path.relative(projectRoot, from)} → ${path.relative(projectRoot, to)}`);
}

async function main() {
  for (const { from, to } of mappings) {
    await copyTree(from, to);
  }
}

main().catch((error) => {
  console.error('[copy-data] Errore durante la copia degli asset statici:', error);
  process.exitCode = 1;
});


