import type { PostMetadata, QualificationResult, PostCategory } from '../types';
import { TYPESAFE_API_URL, TYPESAFE_MODEL, calculateCostUsd } from '../config/default';

export async function qualifyTweet(
  metadata: PostMetadata,
  apiKey: string
): Promise<QualificationResult> {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('TypeSafe AI API key is not configured. Please open extension settings.');
  }

  const payload = {
    model: TYPESAFE_MODEL,
    state: {
      post_text: metadata.text,
      author: metadata.authorName,
      handle: metadata.authorHandle,
      has_links: metadata.hasLinks,
      has_media: metadata.hasMedia,
      is_thread: metadata.isThread
    },
    questions: {
      category: {
        type: 'choice',
        instructions: 'Classify this X (Twitter) post into one of the following distinct categories.',
        criteria: {
          outstanding: 'High-signal, deep original research, proven technical or domain expertise, significant nuance, or exceptional educational/practical substance.',
          good: 'Genuine, authentic personal post, honest question, thoughtful commentary, informative update, or lighthearted humor.',
          engagement_bait: 'Attention-grabbing hook, clickbait phrasing, listicles, artificial suspense, outrage farming, or superficial advice with minimal real substance.',
          ai_slop: 'Generic boilerplate text, repetitive AI platitudes, buzzword-heavy template with zero distinct human perspective.',
          spam: 'Unsolicited promotional advertisement, crypto scheme, scam giveaway, repetitive affiliate shill.'
        }
      },
      substance_depth: {
        type: 'score',
        instructions: 'Evaluate the depth, intellectual substance, and concrete value provided in the post from Level 0 (superficial bait / empty platitudes) to Level 4 (deep, rigorous, insightful substance).',
        criteria: [
          'Pure superficial bait, generic hook, or spam with no actionable or genuine substance.',
          'Very shallow, mostly buzzwords or surface-level claims without real depth.',
          'Moderate substance, basic practical tips or straightforward personal observation.',
          'High substance, well-explained reasoning, concrete details, or valuable perspective.',
          'Exceptional depth, rigorous evidence, breakthrough insight, or masterclass quality.'
        ]
      },
      is_bait_or_spam: {
        type: 'noul',
        instructions: 'Is this post primarily engagement bait, clickbait, or spam?'
      }
    }
  };

  const response = await fetch(TYPESAFE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.trim()}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let message = `TypeSafe AI error (${response.status})`;
    try {
      const parsed = JSON.parse(errorBody);
      message = parsed.message || parsed.detail?.[0]?.msg || errorBody;
    } catch {
      message = errorBody;
    }
    throw new Error(message);
  }

  const data = await response.json();
  const answers = data.answers;

  const category = (answers.category?.choice as PostCategory) || 'good';
  const categoryConfidence = answers.category?.confidence ?? 0.8;
  const categoryProbabilities = answers.category?.probabilities ?? { [category]: 1 };

  const rawScore = typeof answers.substance_depth?.score === 'number' ? answers.substance_depth.score : 2.0;
  // Normalized from 0-4 range to 1-5 human-friendly rating
  const substanceDepthNormalized = Math.round((rawScore + 1) * 10) / 10;
  const substanceDepthConfidence = answers.substance_depth?.confidence ?? 0.8;

  const isBaitOrSpamProbability = typeof answers.is_bait_or_spam?.noul === 'number'
    ? answers.is_bait_or_spam.noul
    : (category === 'engagement_bait' || category === 'spam' ? 0.9 : 0.1);

  const inputTokens = data.usage?.input_tokens ?? 0;
  const outputTokens = data.usage?.output_tokens ?? 0;
  const costUsd = calculateCostUsd(inputTokens, outputTokens);

  return {
    id: metadata.id,
    category,
    categoryConfidence,
    categoryProbabilities,
    substanceDepthScore: rawScore,
    substanceDepthNormalized,
    substanceDepthConfidence,
    isBaitOrSpamProbability,
    inputTokens,
    outputTokens,
    costUsd,
    timestamp: Date.now()
  };
}
