#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Read by scripts/test-*.mjs. Never imported by the extension.
const targetFile = resolve(__dirname, '../src/config/local-secret.json');

// Point this at your own 1Password item:
//   export OP_SECRET_REF="op://<vault>/<item>/credential"
const secretRef = process.env.OP_SECRET_REF || 'op://Dev Secrets/TypeSafe AI/credential';

console.log(`Fetching TypeSafe AI API key from 1Password (${secretRef})...`);

try {
  // Read credential directly using the 1Password service account / user CLI
  const apiKey = execSync(`op read "${secretRef}"`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();

  if (!apiKey || !apiKey.startsWith('apikey_')) {
    console.error('Retrieved value does not look like a valid TypeSafe AI API key.');
    process.exit(1);
  }

  mkdirSync(dirname(targetFile), { recursive: true });
  writeFileSync(targetFile, JSON.stringify({ apiKey }, null, 2), 'utf8');

  console.log(`Saved to ${targetFile} (used by the Node test scripts only, length ${apiKey.length}).`);

  // The extension never bundles the key. It reads it from chrome.storage, which
  // the popup writes. Put it on the clipboard so it can be pasted there.
  if (process.platform === 'darwin') {
    execSync('pbcopy', { input: apiKey });
    console.log('Key copied to clipboard. Paste it in the extension popup (Change → Save).');
  } else {
    console.log('Paste the key into the extension popup (Change → Save).');
  }
} catch (error) {
  console.error('Failed to read from 1Password CLI:', error.message);
  process.exit(1);
}
