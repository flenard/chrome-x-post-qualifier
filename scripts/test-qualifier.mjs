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

const testPosts = [
  {
    type: 'Expected: Engagement Bait',
    metadata: {
      id: 'test_bait_1',
      text: "ChatGPT is just the tip of the iceberg. 99% of people are using it completely wrong. Here are 8 secret prompts that will do 40 hours of work in 15 minutes. Save this thread before it gets deleted! 🧵👇",
      authorName: 'ViralGuru',
      authorHandle: '@viralguru',
      hasLinks: false,
      hasMedia: false,
      isThread: true
    }
  },
  {
    type: 'Expected: Outstanding / High Signal',
    metadata: {
      id: 'test_high_signal',
      text: "We benchmarked Postgres B-Tree vs BRIN indexes on a 1.2TB append-only telemetry table. BRIN reduced index footprint from 142GB down to 68MB and sped up range scans over clustered timestamps by 3.4x. Key caveat: pages_per_range tuning is critical—default 128 was too coarse, 32 was the sweet spot.",
      authorName: 'Alex System Architect',
      authorHandle: '@alex_systems',
      hasLinks: false,
      hasMedia: false,
      isThread: false
    }
  },
  {
    type: 'Expected: Spam / Scam',
    metadata: {
      id: 'test_spam',
      text: "🚨 BREAKING: FREE AIRDROP ALERT! 🚨 Claim your 5,000 $SOLANA bonus now. First 500 wallets only! Connect your wallet at solana-bonus-claim-instant.xyz before timer runs out! 🚀💰",
      authorName: 'Solana Airdrop Bot',
      authorHandle: '@free_sol_claims',
      hasLinks: true,
      hasMedia: false,
      isThread: false
    }
  }
];

const PAYLOAD_TEMPLATE = (post) => ({
  model: 'jev-latest',
  state: {
    post_text: post.text,
    author: post.authorName,
    handle: post.authorHandle,
    has_links: post.hasLinks,
    has_media: post.hasMedia,
    is_thread: post.isThread
  },
  questions: {
    category: {
      type: "choice",
      instructions: "Classify this X (Twitter) post into one of the following distinct categories.",
      criteria: {
        outstanding: "High-signal, deep original research, proven technical or domain expertise, significant nuance, or exceptional educational/practical substance.",
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
});

console.log('Running test suite with TypeSafe AI System One...');
let totalInputTokens = 0;
let totalCost = 0;

for (const test of testPosts) {
  console.log(`\n------------------------------------------------------------`);
  console.log(`Testing: [${test.type}]`);
  console.log(`Text: "${test.metadata.text.slice(0, 80)}..."`);

  const t0 = performance.now();
  const res = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(PAYLOAD_TEMPLATE(test.metadata))
  });

  const latency = (performance.now() - t0).toFixed(0);
  const data = await res.json();
  const answers = data.answers;
  const usage = data.usage;

  const costUsd = (usage.input_tokens / 1_000_000) * 0.042;
  totalInputTokens += usage.input_tokens;
  totalCost += costUsd;

  console.log(`-> Latency: ${latency}ms`);
  console.log(`-> Category: ${answers.category.choice} (confidence: ${(answers.category.confidence * 100).toFixed(1)}%)`);
  console.log(`-> Substance Depth Score: ${answers.substance_depth.score.toFixed(2)} / 4.0`);
  console.log(`-> Bait/Spam Probability: ${(answers.is_bait_or_spam.noul * 100).toFixed(1)}%`);
  console.log(`-> Cost: $${costUsd.toFixed(6)} (${usage.input_tokens} tokens)`);
}

console.log(`\n============================================================`);
console.log(`Total Input Tokens: ${totalInputTokens}`);
console.log(`Total Cost for 3 Evaluations: $${totalCost.toFixed(6)} (${(totalCost * 100).toFixed(4)} cents)`);
