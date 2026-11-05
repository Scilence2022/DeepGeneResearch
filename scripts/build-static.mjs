import { spawn } from 'node:child_process';
import { cp, mkdtemp, rm, symlink } from 'node:fs/promises';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const staging = await mkdtemp(path.join(tmpdir(), 'dgr-static-'));

try {
  const inputs = ['package.json', 'next.config.ts', 'tsconfig.json', 'eslint.config.mjs',
    'postcss.config.mjs', 'tailwind.config.ts', 'public', 'src'];
  const excluded = new Set(['src/middleware.ts', 'src/instrumentation.ts', 'src/app/report/[id]']);
  for (const input of inputs) {
    await cp(path.join(root, input), path.join(staging, input), {
      recursive: true,
      filter(source) {
        const relative = path.relative(root, source).split(path.sep).join('/');
        return !excluded.has(relative)
          && !/^src\/app\/api\/.*\/route\.ts$/.test(relative)
          && !/^public\/(sw|swe-worker).*\.js$/.test(relative);
      },
    });
  }
  await symlink(path.join(root, 'node_modules'), path.join(staging, 'node_modules'), 'junction');

  const build = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'build'], {
    cwd: staging,
    env: { ...process.env, NEXT_PUBLIC_BUILD_MODE: 'export', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: 'inherit',
  });
  const [exitCode] = await once(build, 'exit');
  if (exitCode !== 0) {
    process.exitCode = exitCode || 1;
  } else {
    const destination = path.join(root, 'out');
    await rm(destination, { recursive: true, force: true });
    await cp(path.join(staging, 'out'), destination, { recursive: true });
  }
} finally {
  await rm(staging, { recursive: true, force: true });
}
