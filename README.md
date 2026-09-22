# ⚡ X-Ray — X (Twitter) Post Qualifier & Ad Filter

A Chrome extension that scores posts on X (Twitter) in real time using the
**[TypeSafe AI](https://typesafe.ai) System One API (`jev-latest`)**.
It shows how much substance a post actually has, collapses engagement bait and spam,
blocks promoted ads, and tracks your API spend down to fractions of a cent.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![License: MIT](https://img.shields.io/badge/License-MIT-green)

---

## ✨ Features

- 🧠 **Multi-dimensional post qualification**
  - **Category**: 🌟 High Signal / 💡 Good Post / 🪤 Engagement Bait / 🤖 AI Slop / 🚫 Spam or Scam
  - **Substance & depth score**: a 1.0–5.0 scale for real intellectual density vs. buzzwords
  - **Bait probability**: a direct confidence number, e.g. `94% Bait`
- 🪤 **Auto-collapse bait and spam** into a small pill banner:
  `[ 🪤 Engagement Bait (Confidence: 100% · Depth: 1.1/5) · Click to reveal ]`
  Click to reveal, click again to re-collapse.
- 🤖 **Auto-collapse AI slop** — generic, template-style AI posts get the same banner.
- 🎚 **Filter strictness** — one slider sets how sure the model must be (50–95%)
  before bait, AI slop or spam is hidden.
- 🎯 **Focus mode** — hides every scored post below a minimum depth (2.0–4.5 / 5), so
  only the substantial posts stay. Changing it re-judges the tweets already on the
  page from the cache, with no new API calls.
- 📢 **Ad blocker** — removes sponsored "Ad" / "Promoted" tweets from the timeline.
- 💰 **Live cost tracker** — posts analyzed, input tokens used, and exact USD cost
  ($0.042 per 1M input tokens, outputs free). About **$0.00003 per post**.
- ⚡ **Auto-dwell + caching** — a tweet is only scored after it stays in your viewport
  for 450 ms, so fast scrolling costs nothing. Results are cached in `chrome.storage.local`.

---

## 🚀 Install

### 1. Get an API key

Create a TypeSafe AI account and generate a System One API key.

### 2. Build

```bash
git clone https://github.com/<your-username>/chrome-x-post-qualifier.git
cd chrome-x-post-qualifier
npm install
npm run build
```

The unpacked extension is written to `dist/`.

### 3. Load it in Chrome

1. Go to `chrome://extensions/`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `dist/` folder inside this project

### 4. Add your key

Open the extension popup, click **Change**, and paste your API key. Done.

Now open [x.com](https://x.com) and scroll. Posts get scored as you go.

---

## 🔑 Supplying the API key

The key is **never committed and never bundled into the build**. The extension reads it
from `chrome.storage`, and only the popup writes it there. `npm run build` fails if a key
turns up anywhere in `dist/`, so a shared build cannot carry your key.

**A. The popup** — click **Change**, paste the key, **Save**. That is the only way the
extension gets a key.

**B. 1Password CLI** — fetches the key and copies it to your clipboard, ready to paste
into the popup. It also writes `src/config/local-secret.json` (gitignored), which only the
Node test scripts read:

```bash
export OP_SECRET_REF="op://<your-vault>/<your-item>/credential"
npm run sync-key
```

`OP_SECRET_REF` defaults to `op://Dev Secrets/TypeSafe AI/credential`.

---

## 🧪 Testing the classifier

Run the sample-post verification suite:

```bash
node scripts/test-qualifier.mjs
```

It needs a key — from `local-secret.json` or from the `TYPESAFE_API_KEY` environment
variable.

---

## 🛠 Development

```bash
npm run dev        # rebuild on change
npm run build      # typecheck, then production build
npm run typecheck  # tsc --noEmit
```

After a rebuild, click the reload icon on the extension card in `chrome://extensions/`.

### Project layout

```
src/
├── api/         TypeSafe AI client
├── background/  MV3 service worker
├── config/      defaults, pricing, API key loading
├── content/     timeline scanner and badge rendering
├── popup/       extension UI
├── services/    chrome.storage wrapper, tweet parser
└── types/       shared TypeScript types
scripts/         build, icon generation, key sync, tests
```

---

## 🔒 Privacy

Post text is sent to the TypeSafe AI API to be scored. Nothing else leaves your
browser: there is no analytics, no telemetry, and no server of ours. Your API key
stays in `chrome.storage.local` on your own machine.

---

## 📄 License

MIT — see [LICENSE](LICENSE).
