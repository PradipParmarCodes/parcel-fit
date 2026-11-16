import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.argv[2] ?? join(root, 'dist/offline.html'));
const temp = mkdtempSync(join(tmpdir(), 'parcel-fit-'));
const compiler = process.env.PARCEL_FIT_TSC ?? join(root, 'node_modules/typescript/bin/tsc');

try {
  const template = readFileSync(join(root, 'index.html'), 'utf8');
  const titleReference = /\bsrc="\/(title-truck\.(png|webp))"/;
  const titleImage = template.match(titleReference);
  if (!titleImage) throw new Error('index.html must reference /title-truck.png or /title-truck.webp.');
  const [, titleFilename, titleFormat] = titleImage;
  const titleBytes = readFileSync(join(root, 'public', titleFilename));
  const titleSrc = `src="data:image/${titleFormat};base64,${titleBytes.toString('base64')}"`;

  const compiled = join(temp, 'game.js');
  execFileSync(process.execPath, [
    compiler, '--target', 'ES2022', '--module', 'AMD', '--strict', '--skipLibCheck',
    '--noEmitOnError', '--outFile', compiled, 'src/main.ts',
  ], { cwd: root, stdio: 'inherit' });

  // TypeScript emits named modules. The offline build resolves them from memory.
  const loader = `(() => {
    const modules = new Map();
    const loaded = new Map([['style.css', {}]]);
    function define(name, dependencies, factory) {
      modules.set(name, { dependencies, factory });
    }
    function load(name) {
      name = name.replace(/^\\.\\//, '');
      if (loaded.has(name)) return loaded.get(name);
      const { dependencies, factory } = modules.get(name);
      const exports = {};
      loaded.set(name, exports);
      factory(...dependencies.map(dep => dep === 'exports' ? exports : dep === 'require' ? load : load(dep)));
      return exports;
    }
  `;
  const js = loader + '\n' + readFileSync(compiled, 'utf8') + "\nload('main');\n})();";
  const css = readFileSync(join(root, 'src/style.css'), 'utf8');
  const page = template
    .replace(titleReference, () => titleSrc)
    .replace('</head>', () => '<style>\n' + css + '\n</style></head>')
    .replace('<script type="module" src="/src/main.ts"></script>', () =>
      '<script>\n' + js.replace(/<\/script/gi, '<\\/script') + '\n</script>');
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, page);
  console.log('Offline game written to', output);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
