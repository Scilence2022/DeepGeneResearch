import { cp, mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve('.next/standalone/node_modules');
const resolve = createRequire(import.meta.url);
const pdfManifest = resolve.resolve('pdfjs-dist/package.json');
const resolvePdfDependency = createRequire(pdfManifest);
const canvasManifest = resolvePdfDependency.resolve('@napi-rs/canvas/package.json');
const resolveCanvasDependency = createRequire(canvasManifest);
const canvas = JSON.parse(await readFile(canvasManifest, 'utf8'));

// The parser worker loads PDF.js outside the bundled Next.js server. Stage its
// package and the installed native bindings so the worker can use Node resolution.
const packages = [['pdfjs-dist', pdfManifest], ['@napi-rs/canvas', canvasManifest]];
for (const name of Object.keys(canvas.optionalDependencies ?? {})) {
  try {
    packages.push([name, resolveCanvasDependency.resolve(name + '/package.json')]);
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
  }
}
if (packages.length === 2) throw new Error('PDF.js native canvas binding is missing for this platform');
for (const [name, manifest] of packages) {
  const destination = path.join(root, name);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.dirname(manifest), destination, { recursive: true, dereference: true });
}
