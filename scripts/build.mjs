import { build } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFileSync, mkdirSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

/**
 * The API key is entered in the popup and kept in chrome.storage. It must never
 * be bundled: anyone who gets a copy of dist/ would get the key. Fail the build
 * if a key-shaped string, or the local test key itself, appears in the output.
 */
function assertNoKeyInBuild(distDir) {
  const needles = ['apikey_'];
  const secretFile = resolve(rootDir, 'src/config/local-secret.json');
  if (existsSync(secretFile)) {
    const key = JSON.parse(readFileSync(secretFile, 'utf8')).apiKey;
    if (typeof key === 'string' && key.trim()) needles.push(key.trim());
  }

  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const full = resolve(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

  const leaks = walk(distDir).filter((file) => {
    const text = readFileSync(file, 'latin1');
    return needles.some((n) => text.includes(n));
  });

  if (leaks.length > 0) {
    throw new Error(`API key found in build output — do not share dist/:\n  ${leaks.join('\n  ')}`);
  }
}

async function run() {
  console.log('Building Chrome Extension...');

  // 1. Build Popup UI & Background Worker (ES module)
  await build({
    configFile: false,
    root: rootDir,
    base: './',
    build: {
      target: 'esnext',
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          popup: resolve(rootDir, 'src/popup/index.html'),
          background: resolve(rootDir, 'src/background/service-worker.ts')
        },
        output: {
          entryFileNames: (chunk) => {
            if (chunk.name === 'background') {
              return 'src/background/service-worker.js';
            }
            return 'assets/[name]-[hash].js';
          },
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]'
        }
      }
    }
  });

  // 2. Build Content Script as self-contained IIFE (no external imports)
  await build({
    configFile: false,
    root: rootDir,
    build: {
      target: 'esnext',
      outDir: 'dist',
      emptyOutDir: false,
      lib: {
        entry: resolve(rootDir, 'src/content/index.ts'),
        name: 'XRayContentScript',
        formats: ['iife'],
        fileName: () => 'src/content/index.js'
      }
    }
  });

  // 3. Copy Manifest & Icons
  copyFileSync(resolve(rootDir, 'manifest.json'), resolve(rootDir, 'dist/manifest.json'));

  const iconsSrc = resolve(rootDir, 'public/icons');
  const iconsDest = resolve(rootDir, 'dist/icons');
  if (existsSync(iconsSrc)) {
    mkdirSync(iconsDest, { recursive: true });
    for (const file of readdirSync(iconsSrc)) {
      copyFileSync(resolve(iconsSrc, file), resolve(iconsDest, file));
    }
  }

  assertNoKeyInBuild(resolve(rootDir, 'dist'));
  console.log('Chrome Extension successfully built into dist/ directory!');
}

run().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
