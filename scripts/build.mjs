import { build } from 'vite';
import { ensureLocalSecret } from './ensure-secret.mjs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');



async function run() {
  console.log('Building Chrome Extension...');
  ensureLocalSecret();

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

  console.log('Chrome Extension successfully built into dist/ directory!');
}

run().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
