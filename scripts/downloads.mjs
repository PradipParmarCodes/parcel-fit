import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'parcel-fit-downloads-'));
const playZip = join(root, 'dist/parcel-fit-play.zip');
const sourceZip = join(root, 'dist/parcel-fit.zip');

try {
  execFileSync(process.execPath, ['scripts/offline.mjs', join(temp, 'index.html')], { cwd: root, stdio: 'inherit' });
  for (const file of [playZip, sourceZip]) rmSync(file, { force: true });
  execFileSync('zip', ['-q', playZip, 'index.html'], { cwd: temp });
  execFileSync('zip', ['-qr', sourceZip, 'README.md', 'index.html', 'src', 'scripts', 'work', 'package.json', 'package-lock.json', 'tsconfig.json', '.gitignore'], { cwd: root });
} finally {
  rmSync(temp, { recursive: true, force: true });
}
