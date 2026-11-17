import fs from 'node:fs';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  CharacterMemoryItem,
  GeminiModelId,
  SubtitleSegment,
  VideoCategory,
  WordTimestamp,
} from '../../src/types/subtitle';
import {
  isNonSpeechOrMusicText,
  stripNonSpeechAnnotations,
  wrapSubtitleLines,
} from '../../src/utils/subtitleUtils';
import {
  ALLOWED_GEMINI_MODELS,
  cleanKey,
  getBuiltInGeminiApiKey,
  getServerGeminiApiKey,
  setServerGeminiApiKey,
  getSelectedGeminiModel,
  maskApiKey,
} from './groqService';

/**
 * Formats raw Gemini / HTTP errors into clean, beginner-friendly Myanmar Unicode messages.
 * Never dumps raw JSON error payloads to the UI.
 */
export function formatGeminiErrorInBurmese(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  if (
    raw.includes('API key not valid') ||
    raw.includes('API_KEY_INVALID') ||
    raw.includes('INVALID_ARGUMENT') ||
    raw.includes('insufficient authentication scopes') ||
    raw.includes('PERMISSION_DENIED') ||
    raw.includes('GEMINI_API_KEY_MISSING')
  ) {
    return 'Gemini API Key မမှန်ကန်ပါ သို့မဟုတ် သတ်မှတ်ထားသော မော်ဒယ်နှင့် မကိုက်ညီပါ။ မူလ Built-in Gemini API Key ဖြင့် အလိုအလျောက် ပြန်လည်ချိတ်ဆက်ပေးထားပါသည်၊ "ပြန်လည်စမ်းသပ်ရန်" ကို နှိပ်ပါ။';
  }

  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429') || raw.includes('quota')) {
    return 'Gemini API အသုံးပြုမှု ပမာဏ (Quota) ခေတ္တပြည့်သွားပါသည်။ ခဏစောင့်ဆိုင်းပြီးမှ ပြန်လည်စမ်းသပ်ပါ။';
  }

  if (raw.includes('NOT_FOUND') || raw.includes('404')) {
    return 'ရွေးချယ်ထားသော Gemini မော်ဒယ်ကို လက်ရှိ API Key ဖြင့် အသုံးပြုမရပါ။ အလိုအလျောက် Gemini 3.1 Pro / Gemini 3 Flash သို့ ပြောင်းလဲချိတ်ဆက်ပေးထားပါသည်။';
  }

  if (raw.includes('{"error"')) {
    try {
      const jsonStart = raw.indexOf('{"error"');
      const parsed = JSON.parse(raw.slice(jsonStart));
      const msg = String(parsed?.error?.message || '');
      if (msg.toLowerCase().includes('api key')) {
        return 'ထည့်သွင်းထားသော Gemini API Key မမှန်ကန်ပါ။ မူလ Built-in Gemini API Key သို့ အလိုအလျောက် ပြောင်းလဲပေးထားပါသည်။';
      }
      return 'Gemini AI ဆာဗာနှင့် ချိတ်ဆက်ရာတွင် အမှားဖြစ်ပေါ်နေပါသည်။ ကျေးဇူးပြု၍ "ပြန်လည်စမ်းသပ်ရန်" ကို နှိပ်ပါ။';
    } catch {
      return 'Gemini AI ဆာဗာနှင့် ချိတ်ဆက်ရာတွင် အမှားဖြစ်ပေါ်နေပါသည်။ ကျေးဇူးပြု၍ "ပြန်လည်စမ်းသပ်ရန်" ကို နှိပ်ပါ။';
    }
  }

  return `ဘာသာပြန်ရာတွင် အမှားဖြစ်ပေါ်နေပါသည် - ${raw.replace(/\{[\s\S]*\}/g, '').trim().slice(0, 160) || 'ကျေးဇူးပြု၍ ပြန်လည်စမ်းသပ်ပါ။'}`;
}

function getActiveGeminiKey(overrideKey?: string): string {
  const candidate = cleanKey(
    overrideKey !== undefined && overrideKey.trim() !== ''
      ? overrideKey
      : getServerGeminiApiKey()
  );
  if (candidate && candidate !== 'MY_GEMINI_API_KEY') {
    return candidate;
  }
  const builtIn = getBuiltInGeminiApiKey();
  if (builtIn) {
    return builtIn;
  }
  throw new Error('GEMINI_API_KEY_MISSING');
}

function getGenAIClient(overrideKey?: string): GoogleGenAI {
  const apiKey = getActiveGeminiKey(overrideKey);
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion: 'v1beta',
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sanitizeModelId(model?: string): GeminiModelId {
  if (model && ALLOWED_GEMINI_MODELS.includes(model as GeminiModelId)) {
    return model as GeminiModelId;
  }
  return 'gemini-3.1-pro-preview';
}

function getOrderedModelChain(preferred: GeminiModelId, apiKey: string): GeminiModelId[] {
  const safePreferred = sanitizeModelId(preferred);
  if (apiKey.startsWith('AQ.')) {
    return Array.from(
      new Set<GeminiModelId>([
        safePreferred,
        'gemini-3.1-pro-preview',
        'gemini-3-flash-preview',
        'gemini-2.5-pro',
        'gemini-2.5-flash',
      ])
    );
  }
  return Array.from(
    new Set<GeminiModelId>([
      safePreferred,
      'gemini-3.1-pro-preview',
      'gemini-3-flash-preview',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
    ])
  );
}

/**
 * Category-Specific Burmese Translation Profiles
 */
export const VIDEO_CATEGORY_PROFILES: Record<VideoCategory, string> = {
  anime:
    'Anime Profile: Capture character personality, emotional exclamations, battle/fantasy terminology, and natural Burmese anime fan-sub/official-sub phrasing (e.g., appropriate pronouns ငါ/မင်း, ကျွန်တော်/ခင်ဗျား, အစ်ကိုကြီး/ညီမလေး and expressive endings ကွ, ပေါ့, လားဟ).',
  movies:
    'Cinema / Feature Film Profile: Deliver punchy, emotionally resonant, cinematic Burmese dialogue that fits screen pacing and character dynamics without wordy explanations.',
  drama:
    'Drama Profile: Capture deep emotional undertones, family/romantic relationship dynamics, subtle Burmese honorifics, and heartfelt natural spoken Burmese dialogue.',
  series:
    'TV Series Profile: Maintain interpersonal relationship nuances, social honorifics, sarcasm, humor, and natural conversational continuity across episodes and scenes.',
  documentary:
    'Documentary Profile: Use authoritative, vivid, and clear Burmese documentary narration style with accurate geographical, historical, and scientific terminology.',
  educational:
    'Educational / Lecture Profile: Prioritize conceptual clarity, step-by-step explanation flow, and accurate Burmese academic/technical terms while keeping technical English identifiers intact when appropriate.',
  youtube:
    'YouTube / Creator Vlog Profile: Use lively, modern, engaging everyday spoken Burmese (စကားပြောဟန်) that feels natural for social media and creator videos.',
  interview:
    'Interview / Podcast Profile: Preserve speaker turn-taking, polite conversational markers (ဟုတ်ကဲ့, မှန်ပါတယ်ခင်ဗျာ), and authentic spoken rhythm.',
  general:
    'General Video Profile: Use natural, context-aware conversational Burmese Unicode suitable for general audiences.',
};

/**
 * Performs a real server-side API test request to Gemini using either the user's key
 * or the built-in AI Studio Gemini API key.
 */
export async function testGeminiConnection(
  candidateKey?: string,
  modelToTest?: GeminiModelId
): Promise<{
  ok: boolean;
  modelVerified: string;
  maskedKey?: string;
  message: string;
}> {
  const rawCandidate = cleanKey(candidateKey || '');
  if (rawCandidate.startsWith('gsk_')) {
    return {
      ok: false,
      modelVerified: modelToTest || getSelectedGeminiModel(),
      message:
        'ဤ Key သည် Groq API Key (gsk_...) ဖြစ်နေပါသည်။ မူလ Built-in Gemini API Key ကိုသာ ဆက်လက်အသုံးပြုထားပါသည်။',
    };
  }

  const keyToUse = getActiveGeminiKey(rawCandidate || undefined);
  const targetModel: GeminiModelId =
    modelToTest || getSelectedGeminiModel() || 'gemini-3.1-pro-preview';

  try {
    const ai = getGenAIClient(keyToUse);
    const uniqueModels = getOrderedModelChain(targetModel, keyToUse);

    let verifiedModel: GeminiModelId | '' = '';
    let lastError: unknown = null;

    for (const model of uniqueModels) {
      try {
        const supportsThinkingLevel = !model.startsWith('gemini-2.5');
        const response = await ai.models.generateContent({
          model,
          contents: 'Translate "Welcome" into natural Burmese in one word.',
          config: supportsThinkingLevel
            ? {
                thinkingConfig: {
                  thinkingLevel: ThinkingLevel.HIGH,
                },
              }
            : undefined,
        });
        if (response.text) {
          verifiedModel = model;
          break;
        }
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('API key not valid') || msg.includes('API_KEY_INVALID')) {
          throw err;
        }
      }
    }

    if (!verifiedModel) {
      throw lastError || new Error('Gemini မော်ဒယ်နှင့် ချိတ်ဆက်မရပါ။');
    }

    if (rawCandidate && !rawCandidate.startsWith('AQ.')) {
      setServerGeminiApiKey(rawCandidate);
    }

    const isBuiltIn = keyToUse.startsWith('AQ.');
    return {
      ok: true,
      modelVerified: verifiedModel,
      maskedKey: maskApiKey(keyToUse),
      message: isBuiltIn
        ? `Built-in Gemini API Key အသင့်ချိတ်ဆက်ထားပြီး အောင်မြင်ပါသည် (သီးသန့် Key ထပ်ထည့်ရန် မလိုအပ်ပါ)။`
        : `Gemini API ချိတ်ဆက်မှု အောင်မြင်ပြီး အလိုအလျောက် သိမ်းဆည်းပြီးပါပြီ (${verifiedModel} အသင့်ရှိပါသည်)။`,
    };
  } catch (err) {
    const builtIn = getBuiltInGeminiApiKey();
    if (builtIn && keyToUse !== builtIn) {
      setServerGeminiApiKey('BUILT_IN');
      return testGeminiConnection(builtIn, targetModel);
    }
    return {
      ok: false,
      modelVerified: targetModel,
      message: formatGeminiErrorInBurmese(err),
    };
  }
}

export interface TranscriptionOutput {
  detectedLanguage: string;
  detectedLanguageCode: string;
  segments: Array<{
    startTime: number;
    endTime: number;
    originalText: string;
    speaker?: string;
    words?: WordTimestamp[];
  }>;
}

/**
 * Hybrid Audio Transcription via official Gemini multimodal models when Groq API Key is not yet configured.
 * Automatically falls back to the built-in Gemini API key if a custom key is invalid.
 */
export async function transcribeAudioChunkWithGemini(
  audioFilePath: string,
  mimeType: string,
  _durationSeconds: number,
  startOffsetSec = 0
): Promise<TranscriptionOutput> {
  try {
    const audioBuffer = await fs.promises.readFile(audioFilePath);
    const base64Audio = audioBuffer.toString('base64');

    const prompt = `Transcribe ONLY actual spoken human dialogue in this audio recording accurately.
1. Detect the spoken language (e.g., "English", "Japanese", "Korean", "Chinese", "Thai", "Myanmar", etc.) and its ISO 639-1 code.
2. SPEECH-ONLY SYNCHRONIZATION LAW:
   - NO SPEECH = NO SUBTITLE
   - SPEECH STARTS = SUBTITLE APPEARS ("startTime" is the exact onset of spoken dialogue)
   - SPEECH ENDS = SUBTITLE DISAPPEARS ("endTime" is the exact offset when spoken dialogue stops)
   - Never output subtitles before speech begins or leave them visible during silent pauses or scene transitions.
   - Do NOT generate subtitles for background music, sound effects, applause, or environmental noise.
Return valid JSON matching the requested schema.`;

    const transcribeModels: GeminiModelId[] = [
      'gemini-3-flash-preview',
      'gemini-2.5-flash',
      'gemini-3.1-pro-preview',
    ];
    const keysToTry = Array.from(
      new Set([getActiveGeminiKey(), getBuiltInGeminiApiKey()].filter(Boolean))
    );

    let rawJson = '';
    let lastErr: unknown = null;

    for (const keyCandidate of keysToTry) {
      const ai = getGenAIClient(keyCandidate);
      for (const audioModel of transcribeModels) {
        try {
          const response = await ai.models.generateContent({
            model: audioModel,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: base64Audio,
                  },
                },
                { text: prompt },
              ],
            },
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  detectedLanguage: {
                    type: Type.STRING,
                    description: 'Full name of the detected spoken language, e.g. English',
                  },
                  detectedLanguageCode: {
                    type: Type.STRING,
                    description: '2-letter ISO language code, e.g. en',
                  },
                  segments: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        startTime: {
                          type: Type.NUMBER,
                          description: 'Exact speech onset timestamp in seconds',
                        },
                        endTime: {
                          type: Type.NUMBER,
                          description:
                            'Exact speech offset timestamp in seconds (immediately when speech ends)',
                        },
                        originalText: {
                          type: Type.STRING,
                          description:
                            'Exact transcribed spoken dialogue in original language (no music/SFX tags)',
                        },
                        speaker: {
                          type: Type.STRING,
                          description: 'Optional speaker label',
                        },
                      },
                      required: ['startTime', 'endTime', 'originalText'],
                    },
                  },
                },
                required: ['detectedLanguage', 'detectedLanguageCode', 'segments'],
              },
            },
          });
          if (response.text) {
            rawJson = response.text.trim();
            if (keyCandidate === getBuiltInGeminiApiKey() && keysToTry.length > 1) {
              setServerGeminiApiKey('BUILT_IN');
            }
            break;
          }
        } catch (e) {
          lastErr = e;
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes('API key not valid') || msg.includes('API_KEY_INVALID')) {
            break;
          }
        }
      }
      if (rawJson) break;
    }

    if (!rawJson) {
      throw lastErr || new Error('အသံဖိုင်မှ စာသားထုတ်ယူရာတွင် အမှားဖြစ်ပေါ်နေပါသည်။');
    }
    const parsed = JSON.parse(rawJson) as TranscriptionOutput;

    const adjustedSegments = (parsed.segments || [])
      .filter((seg) => !isNonSpeechOrMusicText(String(seg.originalText || '')))
      .map((seg) => {
        const sStart = Number(
          (Math.max(0, Number(seg.startTime) || 0) + startOffsetSec).toFixed(3)
        );
        const sEnd = Number(
          (
            Math.max(sStart + 0.08, Number(seg.endTime) || sStart + 0.25) + startOffsetSec
          ).toFixed(3)
        );
        return {
          startTime: sStart,
          endTime: sEnd,
          originalText: stripNonSpeechAnnotations(String(seg.originalText || '').trim()),
          speaker: seg.speaker ? String(seg.speaker) : undefined,
        };
      })
      .filter((s) => s.originalText.length > 0);

    return {
      detectedLanguage: parsed.detectedLanguage || 'English',
      detectedLanguageCode: parsed.detectedLanguageCode || 'en',
      segments: adjustedSegments,
    };
  } catch (err) {
    throw new Error(formatGeminiErrorInBurmese(err));
  }
}

/**
 * Context-Memory Batch Burmese Translation Engine using Gemini.
 * - Uses stable segment IDs (`id`).
 * - Sends contextual batches with previous dialogue memory, next-line lookahead, video category profile, character memory, and glossary.
 * - Validates missing IDs, duplicate IDs, unexpected IDs, and empty translations.
 * - NEVER allows Gemini to generate, modify, or replace original timestamps!
 */
export async function translateSegmentsToBurmeseWithGemini(
  segments: Array<{
    id?: string;
    startTime: number;
    endTime: number;
    speechStartTime?: number;
    speechEndTime?: number;
    originalText: string;
    speaker?: string;
    words?: WordTimestamp[];
  }>,
  options: {
    sourceLanguage: string;
    targetLanguage?: string;
    videoCategory?: VideoCategory;
    translationStyle: 'conversational' | 'formal' | 'cinema' | 'documentary';
    thinkingMode: boolean;
    preferredModel?: GeminiModelId;
    glossaryTerms?: Array<{ source: string; burmese: string }>;
    characterMemory?: CharacterMemoryItem[];
    maxLinesPerSubtitle?: number;
    maxCharsPerLine?: number;
  }
): Promise<{
  translatedSegments: SubtitleSegment[];
  modelUsed: string;
  validationStats: {
    totalSegments: number;
    batchesProcessed: number;
    repairedMissingIds: number;
    deduplicatedIds: number;
  };
}> {
  const category: VideoCategory = options.videoCategory || 'general';
  const categoryGuide = VIDEO_CATEGORY_PROFILES[category] || VIDEO_CATEGORY_PROFILES.general;

  const glossaryInstruction =
    options.glossaryTerms && options.glossaryTerms.length > 0
      ? `\nEstablished Terminology & Glossary (Strictly maintain consistency):\n` +
        options.glossaryTerms.map((g) => `- "${g.source}" -> "${g.burmese}"`).join('\n')
      : '';

  const characterInstruction =
    options.characterMemory && options.characterMemory.length > 0
      ? `\nCharacter Memory & Speaker Relationships (Strictly maintain consistent Burmese names and pronouns):\n` +
        options.characterMemory
          .map(
            (c) =>
              `- "${c.name}" -> "${c.burmeseName}"${
                c.relationship ? ` (${c.relationship})` : ''
              }${c.notes ? ` [${c.notes}]` : ''}`
          )
          .join('\n')
      : '';

  const styleGuide: Record<string, string> = {
    conversational:
      'Use natural, idiomatic spoken Myanmar (စကားပြောဟန်) as spoken by native speakers in everyday life, using natural particles (ပါတယ်, တာပေါ့, နော်, လေ, ဗျာ, ရှင့်) that fit the speaker emotion.',
    cinema:
      'Use expressive, emotionally resonant Myanmar film subtitle phrasing (ရုပ်ရှင်စကားပြောဟန်). Keep dialogue natural, concise, and dramatic where appropriate.',
    documentary:
      'Use clear, engaging, and authoritative Myanmar documentary narration style (မှတ်တမ်းရုပ်ရှင်ဟန်) with smooth transitions between clauses.',
    formal:
      'Use polite, refined broadcast/literary Myanmar register (စာပေ/သတင်းဟန်) with accurate terminology.',
  };

  const targetLangLabel = options.targetLanguage || 'Myanmar (Burmese Unicode)';

  const systemInstruction = `You are the Chief Myanmar (Burmese Unicode) Audiovisual Translator and Subtitle Localization Director.
Your task is to translate speech segments from ${options.sourceLanguage} into natural, fluent ${targetLangLabel} (Standard UTF-8 Burmese Unicode, NEVER Zawgyi).

VIDEO CATEGORY PROFILE:
${categoryGuide}

TRANSLATION STYLE:
${styleGuide[options.translationStyle] || styleGuide.conversational}

CONTEXT-AWARE TRANSLATION & STRICT ID RULES:
1. Context Memory: Use the provided previousDialogueMemory, prevLine, and nextLine context so sentences split across segments flow naturally in Burmese grammar (Subject-Object-Verb order).
2. Zero Machine Translation Stiffness: Translate meaning, humor, sarcasm, idioms, and emotional tone rather than literal word-by-word translation.
3. Character & Term Consistency: Preserve character names, speaker relationships, and terminology consistently across all batches.
4. No Hallucinations or Omissions: Translate only what is spoken. Do not add explanations or notes.
5. Subtitle Line Formatting: Maximum ${options.maxLinesPerSubtitle ?? 2} lines per subtitle. Break long lines with \\n at natural Burmese phrase boundaries.
6. STRICT ID & TIMESTAMP LOCK: You are ONLY given segment IDs and text. Never invent or alter IDs. Return a 1-to-1 JSON array containing the exact "id" and "translatedText" for every item in currentBatch.${glossaryInstruction}${characterInstruction}`;

  // Assign stable deterministic segment IDs before batching
  const indexedSegments = segments.map((s, idx) => ({
    ...s,
    stableId: s.id || `seg-${String(idx + 1).padStart(4, '0')}`,
    index: idx + 1,
  }));

  const responseSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        id: {
          type: Type.STRING,
          description: 'Exact stable segment ID from currentBatch (e.g. seg-0001)',
        },
        translatedText: {
          type: Type.STRING,
          description: 'Natural Burmese Unicode translation (max 2 lines)',
        },
      },
      required: ['id', 'translatedText'],
    },
  };

  const preferred: GeminiModelId = sanitizeModelId(
    options.preferredModel || getSelectedGeminiModel() || 'gemini-3.1-pro-preview'
  );
  const keysToTry = Array.from(
    new Set([getActiveGeminiKey(), getBuiltInGeminiApiKey()].filter(Boolean))
  );

  // Process in contextual batches of 18 segments with rolling context memory
  const BATCH_SIZE = 18;
  const translatedById = new Map<string, string>();
  const previousMemory: Array<{ id: string; original: string; burmese: string }> = [];
  let actualModelUsed = 'Gemini 3.1 Pro (ThinkingLevel.HIGH)';
  let batchesProcessed = 0;
  let repairedMissingIds = 0;
  let deduplicatedIds = 0;
  let lastError: unknown = null;

  for (let startIdx = 0; startIdx < indexedSegments.length; startIdx += BATCH_SIZE) {
    const batchSlice = indexedSegments.slice(startIdx, startIdx + BATCH_SIZE);
    batchesProcessed++;

    const currentBatchPayload = batchSlice.map((item, localIdx) => {
      const globalIdx = startIdx + localIdx;
      const prevSeg = globalIdx > 0 ? indexedSegments[globalIdx - 1] : null;
      const nextSeg =
        globalIdx < indexedSegments.length - 1 ? indexedSegments[globalIdx + 1] : null;
      return {
        id: item.stableId,
        speaker: item.speaker || '',
        prevLine: prevSeg ? prevSeg.originalText : '',
        originalText: item.originalText,
        nextLine: nextSeg ? nextSeg.originalText : '',
      };
    });

    const batchPrompt = JSON.stringify(
      {
        videoCategory: category,
        previousDialogueMemory: previousMemory.slice(-4),
        currentBatch: currentBatchPayload,
      },
      null,
      2
    );

    let batchRawText = '';

    for (const keyCandidate of keysToTry) {
      const client = getGenAIClient(keyCandidate);
      const uniqueChain = getOrderedModelChain(preferred, keyCandidate);

      for (const candidateModel of uniqueChain) {
        try {
          const supportsThinkingLevel = !candidateModel.startsWith('gemini-2.5');
          const response = await client.models.generateContent({
            model: candidateModel,
            contents: `Translate every segment in "currentBatch" into natural, context-aware ${targetLangLabel}. Return exact matching "id" and "translatedText":\n${batchPrompt}`,
            config: {
              systemInstruction,
              ...(supportsThinkingLevel
                ? {
                    thinkingConfig: {
                      thinkingLevel: ThinkingLevel.HIGH,
                    },
                  }
                : {}),
              responseMimeType: 'application/json',
              responseSchema,
            },
          });
          if (response.text) {
            batchRawText = response.text.trim();
            actualModelUsed =
              candidateModel === 'gemini-3.1-pro-preview'
                ? 'Gemini 3.1 Pro (ThinkingLevel.HIGH)'
                : `${candidateModel} (ThinkingLevel.HIGH)`;
            if (keyCandidate === getBuiltInGeminiApiKey() && keysToTry.length > 1) {
              setServerGeminiApiKey('BUILT_IN');
            }
            break;
          }
        } catch (err) {
          lastError = err;
          const errMsg = err instanceof Error ? err.message : String(err);
          if (errMsg.includes('API key not valid') || errMsg.includes('API_KEY_INVALID')) {
            break;
          }
        }
      }
      if (batchRawText) break;
    }

    if (!batchRawText) {
      throw new Error(formatGeminiErrorInBurmese(lastError));
    }

    const parsedItems = JSON.parse(batchRawText) as Array<{
      id?: string;
      index?: number;
      translatedText?: string;
    }>;

    // Validate IDs: detect duplicates, unexpected IDs, and missing IDs
    const expectedIds = new Set(batchSlice.map((b) => b.stableId));
    const seenInBatch = new Set<string>();

    for (let i = 0; i < parsedItems.length; i++) {
      const item = parsedItems[i];
      const rawId = String(item.id || '').trim();
      const text = String(item.translatedText || '').trim();

      if (rawId && expectedIds.has(rawId)) {
        if (seenInBatch.has(rawId)) {
          deduplicatedIds++;
          continue;
        }
        if (text) {
          seenInBatch.add(rawId);
          translatedById.set(rawId, text);
        }
      } else if (i < batchSlice.length && text && !seenInBatch.has(batchSlice[i].stableId)) {
        seenInBatch.add(batchSlice[i].stableId);
        translatedById.set(batchSlice[i].stableId, text);
      }
    }

    // Check for any missing IDs in this batch and update rolling context memory
    for (const seg of batchSlice) {
      let finalTrans = translatedById.get(seg.stableId);
      if (!finalTrans || !finalTrans.trim()) {
        repairedMissingIds++;
        finalTrans = seg.originalText;
        translatedById.set(seg.stableId, finalTrans);
      }
      previousMemory.push({
        id: seg.stableId,
        original: seg.originalText,
        burmese: finalTrans,
      });
    }
  }

  // Strictly lock and preserve original timestamps & segment ordering!
  const preservedSegments: SubtitleSegment[] = indexedSegments.map((seg) => {
    const rawTranslated = translatedById.get(seg.stableId) || seg.originalText;
    const wrappedTranslated = wrapSubtitleLines(
      rawTranslated,
      options.maxLinesPerSubtitle ?? 2,
      options.maxCharsPerLine ?? 42
    );

    return {
      id: seg.stableId,
      index: seg.index,
      startTime: seg.startTime,
      endTime: seg.endTime,
      speechStartTime: seg.speechStartTime ?? seg.startTime,
      speechEndTime: seg.speechEndTime ?? seg.endTime,
      originalText: seg.originalText,
      translatedText: wrappedTranslated,
      speaker: seg.speaker,
      words: seg.words,
    };
  });

  return {
    translatedSegments: preservedSegments,
    modelUsed: actualModelUsed,
    validationStats: {
      totalSegments: preservedSegments.length,
      batchesProcessed,
      repairedMissingIds,
      deduplicatedIds,
    },
  };
}

/**
 * Deep Thinking Burmese Subtitle Refinement using `Gemini 3.1 Pro` with `ThinkingLevel.HIGH`.
 * Preserves original timestamps strictly and automatically falls back to built-in Gemini key if custom key fails.
 */
export async function refineBurmeseSubtitlesWithHighThinking(params: {
  segments: SubtitleSegment[];
  instruction: string;
  translationStyle: 'conversational' | 'formal' | 'cinema' | 'documentary';
  videoCategory?: VideoCategory;
}): Promise<{
  updatedSegments: SubtitleSegment[];
  reasoningSummary: string;
  modelUsed: string;
}> {
  const categoryGuide =
    VIDEO_CATEGORY_PROFILES[params.videoCategory || 'general'] ||
    VIDEO_CATEGORY_PROFILES.general;

  const systemInstruction = `You are a Senior Myanmar Literary & Audiovisual Subtitle Localization Specialist.
Use deep reasoning to refine the provided Burmese Unicode subtitles according to the user's instruction.
${categoryGuide}
Always output standard Myanmar Unicode (UTF-8), keep max 2 lines per subtitle, and NEVER modify timestamps or segment IDs.`;

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      reasoningSummary: {
        type: Type.STRING,
        description: 'Brief explanation in Burmese of how phrasing and consistency were improved',
      },
      segments: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            translatedText: { type: Type.STRING },
          },
          required: ['id', 'translatedText'],
        },
      },
    },
    required: ['reasoningSummary', 'segments'],
  };

  const prompt = `User Instruction: "${params.instruction}"
Target Register: ${params.translationStyle}

Current Segments:
${JSON.stringify(
  params.segments.map((s) => ({
    id: s.id,
    index: s.index,
    originalText: s.originalText,
    translatedText: s.translatedText,
  })),
  null,
  2
)}`;

  const keysToTry = Array.from(
    new Set([getActiveGeminiKey(), getBuiltInGeminiApiKey()].filter(Boolean))
  );

  let rawText = '';
  let modelUsed = 'Gemini 3.1 Pro (ThinkingLevel.HIGH)';
  let lastError: unknown = null;

  for (const keyCandidate of keysToTry) {
    const ai = getGenAIClient(keyCandidate);
    const modelChain = getOrderedModelChain('gemini-3.1-pro-preview', keyCandidate);

    for (const candidateModel of modelChain) {
      try {
        const supportsThinkingLevel = !candidateModel.startsWith('gemini-2.5');
        const response = await ai.models.generateContent({
          model: candidateModel,
          contents: prompt,
          config: {
            systemInstruction,
            ...(supportsThinkingLevel
              ? {
                  thinkingConfig: {
                    thinkingLevel: ThinkingLevel.HIGH,
                  },
                }
              : {}),
            responseMimeType: 'application/json',
            responseSchema,
          },
        });
        if (response.text) {
          rawText = response.text.trim();
          modelUsed =
            candidateModel === 'gemini-3.1-pro-preview'
              ? 'Gemini 3.1 Pro (ThinkingLevel.HIGH)'
              : `${candidateModel} (ThinkingLevel.HIGH)`;
          if (keyCandidate === getBuiltInGeminiApiKey() && keysToTry.length > 1) {
            setServerGeminiApiKey('BUILT_IN');
          }
          break;
        }
      } catch (err) {
        lastError = err;
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes('API key not valid') || errMsg.includes('API_KEY_INVALID')) {
          break;
        }
      }
    }
    if (rawText) break;
  }

  if (!rawText) {
    throw new Error(formatGeminiErrorInBurmese(lastError));
  }

  const parsed = JSON.parse(rawText) as {
    reasoningSummary: string;
    segments: Array<{ id: string; translatedText: string }>;
  };

  const mapById = new Map(parsed.segments.map((s) => [s.id, s]));
  const updatedSegments = params.segments.map((seg) => {
    const updated = mapById.get(seg.id);
    if (!updated || !updated.translatedText.trim()) return seg;
    return {
      ...seg,
      translatedText: wrapSubtitleLines(updated.translatedText.trim(), 2, 42),
    };
  });

  return {
    updatedSegments,
    reasoningSummary:
      parsed.reasoningSummary ||
      'မြန်မာစာတန်းထိုး အသုံးအနှုန်းများကို ပိုမိုသဘာဝကျအောင် ပြင်ဆင်ပြီးပါပြီ။',
    modelUsed,
  };
}

