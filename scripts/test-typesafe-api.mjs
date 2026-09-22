import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const secretPath = resolve(__dirname, '../src/config/local-secret.json');
const { apiKey } = existsSync(secretPath)
  ? JSON.parse(readFileSync(secretPath, 'utf8'))
  : { apiKey: process.env.TYPESAFE_API_KEY || '' };

if (!apiKey) {
  console.error('No API key. Run `npm run sync-key`, or set TYPESAFE_API_KEY, or copy');
  console.error('src/config/local-secret.example.json to src/config/local-secret.json and fill it in.');
  process.exit(1);
}

console.log('Testing TypeSafe AI API with key prefix:', apiKey.slice(0, 10));

const payload = {
  model: 'jev-latest',
  state: {
    post_text: "Here are 10 AI tools that will 10x your productivity (99% of people don't know #7). A quick thread 🧵👇",
    author: "GrowthGuru",
    handle: "@growthguru",
    has_links: false,
    has_media: false
  },
  questions: {
    category: {
      type: "choice",
      instructions: "Classify this X (Twitter) post into one of the following distinct categories.",
      criteria: {
        outstanding: "High-signal, deep original research, proven technical or domain expertise, significant nuance and educational/practical substance.",
        good: "Genuine, authentic personal post, honest question, thoughtful commentary, informative update, or lighthearted humor.",
        engagement_bait: "Attention-grabbing hook, clickbait phrasing, listicles, artificial suspense, outrage farming, or superficial advice with minimal real substance.",
        ai_slop: "Generic boilerplate text, repetitive AI platitudes, buzzword-heavy template with zero distinct human perspective.",
        spam: "Unsolicited promotional advertisement, crypto scheme, scam giveaway, repetitive affiliate shill."
      }
    },
    substance_depth: {
      type: "score",
      instructions: "Evaluate the depth, intellectual substance, and concrete value provided in the post from Level 0 (superficial bait / empty platitudes) to Level 4 (deep, rigorous, insightful substance).",
      criteria: [
        "Pure superficial bait, generic hook, or spam with no actionable or genuine substance.",
        "Very shallow, mostly buzzwords or surface-level claims without real depth.",
        "Moderate substance, basic practical tips or straightforward personal observation.",
        "High substance, well-explained reasoning, concrete details, or valuable perspective.",
        "Exceptional depth, rigorous evidence, breakthrough insight, or masterclass quality."
      ]
    },
    is_bait_or_spam: {
      type: "noul",
      instructions: "Is this post primarily engagement bait, clickbait, or spam?"
    }
  }
};

const startTime = performance.now();
const res = await fetch('https://api.typesafe.ai/v1/systemone', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  },
  body: JSON.stringify(payload)
});

const elapsed = (performance.now() - startTime).toFixed(1);
console.log(`HTTP Status: ${res.status} (took ${elapsed}ms)`);

if (!res.ok) {
  const errText = await res.text();
  console.error('API Error Response:', errText);
  process.exit(1);
}

const data = await res.json();
console.log('Response:');
console.dir(data, { depth: null });
