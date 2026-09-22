#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The API key lives in src/config/local-secret.json, which is gitignored, so a
 * fresh clone does not have one. src/config/secret.ts imports it directly, and
 * both tsc and the bundler fail on the missing module. Create an empty one.
 * Users then paste their key into the extension popup, or run `npm run sync-key`.
 */
export function ensureLocalSecret() {
  const secretFile = resolve(rootDir, 'src/config/local-secret.json');
  if (existsSync(secretFile)) return false;

  const exampleFile = resolve(rootDir, 'src/config/local-secret.example.json');
  const contents = existsSync(exampleFile)
    ? readFileSync(exampleFile, 'utf8')
    : JSON.stringify({ apiKey: '' }, null, 2);

  writeFileSync(secretFile, contents, 'utf8');
  console.log('No local-secret.json found — created an empty one.');
  console.log('Add your API key in the extension popup, or run `npm run sync-key`.');
  return true;
}

// Also runnable on its own: `node scripts/ensure-secret.mjs`
if (import.meta.url === `file://${process.argv[1]}`) ensureLocalSecret();
