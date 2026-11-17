import fs from 'node:fs';
import path from 'node:path';
import { TranscriptionOutput } from './geminiService';
import { GeminiModelId, WordTimestamp } from '../../src/types/subtitle';
import {
  isNonSpeechOrMusicText,
  stripNonSpeechAnnotations,
} from '../../src/utils/subtitleUtils';

// Secure server-side runtime key store (never exposed in full to client or logs)
// Uses built-in process.env.GEMINI_API_KEY out-of-the-box
let serverGroqApiKey: string = cleanKey(process.env.GROQ_API_KEY || '');
let customGeminiApiKey: string = '';
let selectedGeminiModel: GeminiModelId = 'gemini-3.1-pro-preview';
let selectedWhisperModel: string = process.env.WHISPER_MODEL_SIZE || 'whisper-large-v3';

export const ALLOWED_GEMINI_MODELS: GeminiModelId[] = [
  'gemini-3.1-pro-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
];

export function cleanKey(raw: string): string {
  return (raw || '')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .replace(/^Bearer\s+/i, '')
    .trim();
}

export function isUsableEnvGeminiKey(key: string): boolean {
  const k = cleanKey(key);
  if (!k || k === 'MY_GEMINI_API_KEY') {
    return false;
  }
  return true;
}

export function maskApiKey(key: string): string {
  const trimmed = cleanKey(key);
  if (!trimmed || trimmed === 'MY_GEMINI_API_KEY') return '';
  if (trimmed.startsWith('AQ.')) {
    return `Built-in AI Studio Key (${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)})`;
  }
  if (trimmed.length <= 8) {
    return '••••••••';
  }
  return `${trimmed.slice(0, 4)}••••••••••••${trimmed.slice(-4)}`;
}

export function getServerGroqApiKey(): string {
  return cleanKey(serverGroqApiKey || process.env.GROQ_API_KEY || '');
}

export function getBuiltInGeminiApiKey(): string {
  const envKey = cleanKey(process.env.GEMINI_API_KEY || '');
  return envKey && envKey !== 'MY_GEMINI_API_KEY' ? envKey : '';
}

export function getServerGeminiApiKey(): string {
  const custom = cleanKey(customGeminiApiKey);
  if (custom && custom !== 'MY_GEMINI_API_KEY') {
    return custom;
  }
  return getBuiltInGeminiApiKey();
}

export function setServerGroqApiKey(newKey: string): void {
  const cleaned = cleanKey(newKey);
  if (cleaned) {
    serverGroqApiKey = cleaned;
  }
}

export function setServerGeminiApiKey(newKey: string): void {
  const cleaned = cleanKey(newKey);
  if (!cleaned || cleaned === 'BUILT_IN' || cleaned.startsWith('Built-in')) {
    customGeminiApiKey = '';
    return;
  }
  customGeminiApiKey = cleaned;
}

export function isUsingBuiltInGeminiKey(): boolean {
  return !cleanKey(customGeminiApiKey) && Boolean(getBuiltInGeminiApiKey());
}

export function getSelectedGeminiModel(): GeminiModelId {
  return selectedGeminiModel;
}

export function setSelectedGeminiModel(model: GeminiModelId): void {
  if (ALLOWED_GEMINI_MODELS.includes(model)) {
    selectedGeminiModel = model;
  }
}

export function getSelectedWhisperModel(): string {
  return selectedWhisperModel;
}

export function setSelectedWhisperModel(model: string): void {
  if (model.trim()) {
    selectedWhisperModel = model.trim();
  }
}

/**
 * Performs a real API connection test against Groq's OpenAI-compatible models endpoint
 * and verifies `whisper-large-v3` availability. Auto-saves key if valid.
 */
export async function testGroqConnection(candidateKey?: string): Promise<{
  ok: boolean;
  modelVerified: string;
  maskedKey?: string;
  message: string;
}> {
  const keyToTest = cleanKey(
    candidateKey !== undefined && candidateKey.trim() !== ''
      ? candidateKey
      : getServerGroqApiKey()
  );

  if (!keyToTest) {
    return {
      ok: false,
      modelVerified: selectedWhisperModel,
      message:
        'Groq API Key ထည့်သွင်းထားခြင်း မရှိသေးပါ။ ကျေးဇူးပြု၍ Groq API Key (gsk_...) ထည့်သွင်းပြီး စမ်းသပ်ပါ။',
    };
  }

  if (keyToTest.startsWith('AIza')) {
    return {
      ok: false,
      modelVerified: selectedWhisperModel,
      message:
        'ဤ Key သည် Gemini API Key (AIza...) ဖြစ်နေပါသည်။ ကျေးဇူးပြု၍ Groq API Key (gsk_...) ကို ထည့်သွင်းပါ။',
    };
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${keyToTest}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      return {
        ok: false,
        modelVerified: selectedWhisperModel,
        message:
          'Groq API Key မမှန်ကန်ပါ သို့မဟုတ် သက်တမ်းကုန်နေပါသည်။ Key ကို ပြန်လည်စစ်ဆေးပြီး ထပ်မံစမ်းသပ်ပါ။',
      };
    }

    const data = (await response.json()) as { data?: Array<{ id: string }> };
    const models = Array.isArray(data.data) ? data.data.map((m) => m.id) : [];
    const hasWhisper = models.includes('whisper-large-v3');

    setServerGroqApiKey(keyToTest);

    return {
      ok: true,
      modelVerified: hasWhisper ? 'whisper-large-v3' : selectedWhisperModel,
      maskedKey: maskApiKey(keyToTest),
      message: `Groq API ချိတ်ဆက်မှု အောင်မြင်ပြီး အလိုအလျောက် သိမ်းဆည်းပြီးပါပြီ (${
        hasWhisper ? 'whisper-large-v3 အသင့်ရှိပါသည်' : `${models.length} models အသင့်ရှိပါသည်`
      })။`,
    };
  } catch (err) {
    return {
      ok: false,
      modelVerified: selectedWhisperModel,
      message: `Groq ဆာဗာသို့ ချိတ်ဆက်ရာတွင် အမှားဖြစ်ပေါ်နေပါသည် - ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}

/**
 * Transcribes extracted audio using Groq `whisper-large-v3` with verbose_json,
 * requesting both segment-level and word-level timestamps (`timestamp_granularities[]`: 'segment', 'word')
 * and filtering out non-speech background music, sound effects, and environmental noise.
 */
export async function transcribeAudioWithGroqWhisper(
  audioFilePath: string,
  startOffsetSec = 0,
  targetLanguageHint?: string
): Promise<TranscriptionOutput> {
  const apiKey = getServerGroqApiKey();
  if (!apiKey) {
    throw new Error('GROQ_API_KEY_NOT_CONFIGURED');
  }

  const fileBytes = await fs.promises.readFile(audioFilePath);
  const fileBlob = new Blob([fileBytes], { type: 'audio/wav' });
  const form = new FormData();
  form.append('file', fileBlob, path.basename(audioFilePath));
  form.append('model', selectedWhisperModel || 'whisper-large-v3');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');
  form.append('timestamp_granularities[]', 'word');
  form.append(
    'prompt',
    'Transcribe only actual spoken human dialogue. Ignore background music, sound effects, applause, and silence.'
  );
  if (targetLanguageHint && targetLanguageHint !== 'auto') {
    form.append('language', targetLanguageHint);
  }

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
    signal: AbortSignal.timeout(90000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Groq Whisper API အမှား (${response.status}): ${errText}`);
  }

  const result = (await response.json()) as {
    language?: string;
    text?: string;
    segments?: Array<{ start: number; end: number; text: string }>;
    words?: Array<{ word: string; start: number; end: number }>;
  };

  const allWords: WordTimestamp[] = Array.isArray(result.words)
    ? result.words
        .map((w) => ({
          word: stripNonSpeechAnnotations(String(w.word || '').trim()),
          start: Number((Math.max(0, Number(w.start) || 0) + startOffsetSec).toFixed(3)),
          end: Number((Math.max(0.05, Number(w.end) || 0.2) + startOffsetSec).toFixed(3)),
        }))
        .filter((w) => w.word.length > 0 && !isNonSpeechOrMusicText(w.word))
    : [];

  const rawSegments = Array.isArray(result.segments) ? result.segments : [];
  const mappedSegments =
    rawSegments.length > 0
      ? rawSegments
          .filter((seg) => !isNonSpeechOrMusicText(String(seg.text || '')))
          .map((seg) => {
            const segStart = Number((Math.max(0, Number(seg.start) || 0) + startOffsetSec).toFixed(3));
            const segEnd = Number((Math.max(segStart + 0.08, Number(seg.end) || segStart + 0.25) + startOffsetSec).toFixed(3));
            const matchingWords = allWords.filter(
              (w) => w.start >= segStart - 0.15 && w.end <= segEnd + 0.25
            );
            const wordAnchoredStart =
              matchingWords.length > 0 ? matchingWords[0].start : segStart;
            const wordAnchoredEnd =
              matchingWords.length > 0
                ? matchingWords[matchingWords.length - 1].end
                : segEnd;
            return {
              startTime: wordAnchoredStart,
              endTime: Math.max(wordAnchoredStart + 0.08, wordAnchoredEnd),
              originalText: stripNonSpeechAnnotations(String(seg.text || '').trim()),
              words: matchingWords.length > 0 ? matchingWords : undefined,
            };
          })
          .filter((s) => s.originalText.length > 0)
      : result.text?.trim() && !isNonSpeechOrMusicText(result.text)
      ? [
          {
            startTime: allWords.length > 0 ? allWords[0].start : startOffsetSec,
            endTime:
              allWords.length > 0
                ? allWords[allWords.length - 1].end
                : Number((startOffsetSec + 1.0).toFixed(3)),
            originalText: stripNonSpeechAnnotations(result.text.trim()),
            words: allWords.length > 0 ? allWords : undefined,
          },
        ]
      : [];

  const langMap: Record<string, { label: string; code: string }> = {
    english: { label: 'အင်္ဂလိပ် (English)', code: 'en' },
    en: { label: 'အင်္ဂလိပ် (English)', code: 'en' },
    japanese: { label: 'ဂျပန် (Japanese)', code: 'ja' },
    ja: { label: 'ဂျပန် (Japanese)', code: 'ja' },
    korean: { label: 'ကိုရီးယား (Korean)', code: 'ko' },
    ko: { label: 'ကိုရီးယား (Korean)', code: 'ko' },
    chinese: { label: 'တရုတ် (Chinese)', code: 'zh' },
    zh: { label: 'တရုတ် (Chinese)', code: 'zh' },
    thai: { label: 'ထိုင်း (Thai)', code: 'th' },
    th: { label: 'ထိုင်း (Thai)', code: 'th' },
    myanmar: { label: 'မြန်မာ (Myanmar)', code: 'my' },
    burmese: { label: 'မြန်မာ (Myanmar)', code: 'my' },
    my: { label: 'မြန်မာ (Myanmar)', code: 'my' },
  };

  const rawLang = (result.language || 'english').toLowerCase().trim();
  const matched = langMap[rawLang] || {
    label: result.language || 'English',
    code: rawLang.slice(0, 2) || 'en',
  };

  return {
    detectedLanguage: matched.label,
    detectedLanguageCode: matched.code,
    segments: mappedSegments,
  };
}
