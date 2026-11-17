import {
  SilenceInterval,
  SpeechInterval,
  SubtitleExportFormat,
  SubtitleSegment,
  TimingIssue,
  TimingMode,
  TranslationIssue,
  WordTimestamp,
} from '../types/subtitle';

/**
 * Formats seconds (e.g., 65.432) to standard SRT timestamp format (00:01:05,432)
 */
export function formatSrtTimestamp(seconds: number): string {
  const clamped = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const totalMs = Math.round(clamped * 1000);
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const pad3 = (n: number) => String(n).padStart(3, '0');

  return `${pad2(hours)}:${pad2(minutes)}:${pad2(secs)},${pad3(ms)}`;
}

/**
 * Formats seconds to WebVTT timestamp format (00:01:05.432)
 */
export function formatVttTimestamp(seconds: number): string {
  return formatSrtTimestamp(seconds).replace(',', '.');
}

/**
 * Formats seconds to ASS (SubStation Alpha) timestamp format (H:MM:SS.cc)
 */
export function formatAssTimestamp(seconds: number): string {
  const clamped = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const totalCs = Math.round(clamped * 100);
  const hours = Math.floor(totalCs / 360000);
  const minutes = Math.floor((totalCs % 360000) / 6000);
  const secs = Math.floor((totalCs % 6000) / 100);
  const cs = totalCs % 100;

  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${hours}:${pad2(minutes)}:${pad2(secs)}.${pad2(cs)}`;
}

/**
 * Formats seconds to compact display timecode (MM:SS.ms)
 */
export function formatDisplayTimecode(seconds: number): string {
  const clamped = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const totalMs = Math.round(clamped * 1000);
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const tenths = Math.floor((totalMs % 1000) / 10);

  const pad2 = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) {
    return `${pad2(hours)}:${pad2(minutes)}:${pad2(secs)}.${pad2(tenths)}`;
  }
  return `${pad2(minutes)}:${pad2(secs)}.${pad2(tenths)}`;
}

/**
 * Parses an SRT/VTT timestamp (HH:MM:SS,mmm or HH:MM:SS.mmm or MM:SS.mm) into seconds
 */
export function parseSrtTimestamp(timestamp: string): number | null {
  const clean = timestamp.trim();
  const fullMatch = clean.match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (fullMatch) {
    const hours = parseInt(fullMatch[1], 10);
    const minutes = parseInt(fullMatch[2], 10);
    const secs = parseInt(fullMatch[3], 10);
    const msStr = fullMatch[4].padEnd(3, '0');
    const ms = parseInt(msStr, 10);
    if (minutes >= 60 || secs >= 60) return null;
    return hours * 3600 + minutes * 60 + secs + ms / 1000;
  }

  const shortMatch = clean.match(/^(\d{1,2}):(\d{2})(?:[,.](\d{1,3}))?$/);
  if (shortMatch) {
    const minutes = parseInt(shortMatch[1], 10);
    const secs = parseInt(shortMatch[2], 10);
    const msStr = (shortMatch[3] || '0').padEnd(3, '0');
    const ms = parseInt(msStr, 10);
    if (secs >= 60) return null;
    return minutes * 60 + secs + ms / 1000;
  }

  return null;
}

/**
 * Wraps Burmese or Latin subtitle text into a maximum of 2 balanced lines
 * at natural Burmese phrase boundaries (၊, ။, or whitespace).
 */
export function wrapSubtitleLines(
  text: string,
  maxLines = 2,
  maxCharsPerLine = 42
): string {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ');

  if (!normalized) return '';
  if (normalized.length <= maxCharsPerLine || maxLines <= 1) {
    return normalized;
  }

  const mid = Math.floor(normalized.length / 2);
  let bestSplit = -1;
  let bestDistance = Infinity;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === ' ' || ch === '၊' || ch === '။') {
      const dist = Math.abs(i - mid);
      if (dist < bestDistance && i > 4 && i < normalized.length - 4) {
        bestDistance = dist;
        bestSplit = ch === ' ' ? i : i + 1;
      }
    }
  }

  if (bestSplit !== -1) {
    const line1 = normalized.slice(0, bestSplit).trim();
    const line2 = normalized.slice(bestSplit).trim();
    return `${line1}\n${line2}`;
  }

  return normalized;
}

/**
 * Removes duplicate transcription segments at audio chunk boundaries when overlapping chunks are used.
 */
export function deduplicateChunkSegments<
  T extends { startTime: number; endTime: number; originalText: string; words?: WordTimestamp[] }
>(segments: T[]): T[] {
  if (segments.length <= 1) return segments;
  const sorted = [...segments].sort((a, b) => a.startTime - b.startTime);
  const result: T[] = [];

  const normalizeWords = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();

  for (const current of sorted) {
    if (!current.originalText.trim()) continue;
    const prev = result[result.length - 1];
    if (!prev) {
      result.push(current);
      continue;
    }

    const normCurr = normalizeWords(current.originalText);
    const normPrev = normalizeWords(prev.originalText);
    const timeOverlap = prev.endTime - current.startTime;

    // Duplicate at chunk boundary if timestamps overlap or are within 0.4s and text matches/contains
    const isDuplicateText =
      normCurr === normPrev ||
      (normCurr.length > 8 && normPrev.includes(normCurr)) ||
      (normPrev.length > 8 && normCurr.includes(normPrev));

    if (timeOverlap > -0.4 && isDuplicateText) {
      // Keep the longer/more complete version without extending past real speech end
      if (normCurr.length > normPrev.length) {
        result[result.length - 1] = {
          ...current,
          startTime: Math.min(prev.startTime, current.startTime),
        };
      }
      continue;
    }

    result.push(current);
  }

  return result;
}

/**
 * Non-speech patterns (background music, sound effects, applause, environmental noise).
 * Per core rule: Do not generate subtitles for background music, sound effects, or environmental noise unless explicitly requested.
 */
const PURE_NON_SPEECH_REGEX =
  /^(?:\[[^\]]*(?:music|applause|laughter|silence|noise|sfx|sound|effect|sigh|cough| gasp|breath|footstep|ambient|instrumental|intro|outro|ဂီတ|အသံတိတ်|ဆူညံသံ|လက်ခုပ်သံ)[^\]]*\]|\([^)]*(?:music|applause|laughter|silence|noise|sfx|sound|effect|sigh|cough|gasp|breath|footstep|ambient|instrumental|ဂီတ|အသံတိတ်|ဆူညံသံ)[^)]*\)|[♪♫♬♩\s.,!~-]+)$/i;

const INLINE_NON_SPEECH_TAG_REGEX =
  /(?:\[[^\]]*(?:music|applause|laughter|silence|noise|sfx|sound|effect|ambient|instrumental|ဂီတ|အသံတိတ်|ဆူညံသံ)[^\]]*\]|\([^)]*(?:music|applause|laughter|silence|noise|sfx|sound|effect|ambient|instrumental|ဂီတ|အသံတိတ်|ဆူညံသံ)[^)]*\)|[♪♫♬♩]+)/gi;

export function isNonSpeechOrMusicText(
  text: string,
  includeNonSpeechCaptions = false
): boolean {
  if (includeNonSpeechCaptions) return false;
  const trimmed = (text || '').trim();
  if (!trimmed) return true;
  if (PURE_NON_SPEECH_REGEX.test(trimmed)) return true;
  const stripped = trimmed.replace(INLINE_NON_SPEECH_TAG_REGEX, '').trim();
  return stripped.length === 0;
}

export function stripNonSpeechAnnotations(
  text: string,
  includeNonSpeechCaptions = false
): string {
  if (includeNonSpeechCaptions) return (text || '').trim();
  return (text || '')
    .replace(INLINE_NON_SPEECH_TAG_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Reconciles raw transcription segments against word-level timestamps and VAD silence/speech intervals:
 * 1. Filters out non-speech captions (background music, SFX, environmental noise) unless explicitly requested.
 * 2. Anchors start/end strictly to spoken word boundaries when available.
 * 3. Splits segments whenever there is a genuine internal silence pause (>= 0.50s confirmed VAD silence or >= 0.70s word gap),
 *    while preserving short natural pauses (< 0.45s) between words in continuous dialogue.
 * 4. Trims subtitle startTime and endTime so subtitles NEVER appear before speech begins or remain after speech ends.
 */
export function reconcileSegmentsWithVadAndWords(
  rawSegments: Array<{
    startTime: number;
    endTime: number;
    originalText: string;
    speaker?: string;
    words?: WordTimestamp[];
  }>,
  silenceIntervals: SilenceInterval[] = [],
  speechIntervals: SpeechInterval[] = [],
  includeNonSpeechCaptions = false
): Array<{
  startTime: number;
  endTime: number;
  speechStartTime: number;
  speechEndTime: number;
  originalText: string;
  speaker?: string;
  words?: WordTimestamp[];
}> {
  // Step 0: Filter out non-speech / music / SFX segments
  const speechOnlyRaw = rawSegments
    .filter((seg) => !isNonSpeechOrMusicText(seg.originalText, includeNonSpeechCaptions))
    .map((seg) => ({
      ...seg,
      originalText: stripNonSpeechAnnotations(seg.originalText, includeNonSpeechCaptions),
      words: seg.words
        ? seg.words.filter((w) => !isNonSpeechOrMusicText(w.word, includeNonSpeechCaptions))
        : undefined,
    }))
    .filter((seg) => seg.originalText.length > 0);

  const deduped = deduplicateChunkSegments(speechOnlyRaw);
  const splitByWordSilence: typeof deduped = [];

  // Step 1: Split a segment if word-level timestamps or VAD silence reveal a genuine internal silence gap
  for (const seg of deduped) {
    const words =
      seg.words && seg.words.length > 1
        ? [...seg.words].sort((a, b) => a.start - b.start)
        : null;
    if (!words) {
      splitByWordSilence.push(seg);
      continue;
    }

    let currentWords: WordTimestamp[] = [words[0]];
    for (let i = 1; i < words.length; i++) {
      const prevW = words[i - 1];
      const currW = words[i];
      const gap = currW.start - prevW.end;

      // Check if this inter-word gap coincides with a confirmed VAD silence interval (>= 0.40s)
      const confirmedSilenceGap = silenceIntervals.some(
        (sil) =>
          sil.duration >= 0.4 &&
          sil.start >= prevW.end - 0.08 &&
          sil.end <= currW.start + 0.08
      );

      // Split on genuine silence pause (>= 0.70s word gap OR >= 0.45s VAD-confirmed silence),
      // while keeping short inter-word pauses (< 0.45s) inside continuous dialogue
      if ((gap >= 0.7 || (gap >= 0.45 && confirmedSilenceGap)) && currentWords.length >= 1) {
        splitByWordSilence.push({
          startTime: Number(currentWords[0].start.toFixed(3)),
          endTime: Number(currentWords[currentWords.length - 1].end.toFixed(3)),
          originalText: currentWords.map((w) => w.word.trim()).join(' '),
          speaker: seg.speaker,
          words: currentWords,
        });
        currentWords = [currW];
      } else {
        currentWords.push(currW);
      }
    }

    if (currentWords.length > 0) {
      splitByWordSilence.push({
        startTime: Number(currentWords[0].start.toFixed(3)),
        endTime: Number(currentWords[currentWords.length - 1].end.toFixed(3)),
        originalText:
          currentWords.length < words.length
            ? currentWords.map((w) => w.word.trim()).join(' ')
            : seg.originalText,
        speaker: seg.speaker,
        words: currentWords,
      });
    }
  }

  // Step 2: Reconcile each segment's onset and offset independently against VAD speech and silence intervals
  return splitByWordSilence.map((seg) => {
    let speechStart = Math.max(0, Number(seg.startTime.toFixed(3)));
    let speechEnd = Math.max(speechStart + 0.08, Number(seg.endTime.toFixed(3)));

    // Anchor strictly to spoken word boundaries when available
    if (seg.words && seg.words.length > 0) {
      const firstWordStart = seg.words[0].start;
      const lastWordEnd = seg.words[seg.words.length - 1].end;
      if (Number.isFinite(firstWordStart) && firstWordStart >= 0) {
        speechStart = Number(firstWordStart.toFixed(3));
      }
      if (Number.isFinite(lastWordEnd) && lastWordEnd > speechStart) {
        speechEnd = Number(lastWordEnd.toFixed(3));
      }
    }

    // Independent Onset & Offset clamping against confirmed VAD silence intervals
    for (const sil of silenceIntervals) {
      if (sil.duration < 0.25) continue;
      // 1. Pre-speech silence: If segment starts inside silence before speech begins, push startTime to sil.end
      if (
        speechStart >= sil.start - 0.05 &&
        speechStart < sil.end - 0.02 &&
        speechEnd > sil.end + 0.08
      ) {
        speechStart = Number(sil.end.toFixed(3));
      }
      // 2. Post-speech silence: If speech stops and silence begins before segment endTime, clamp endTime to sil.start immediately!
      if (
        sil.start > speechStart + 0.12 &&
        sil.start < speechEnd &&
        sil.end >= speechEnd - 0.05
      ) {
        speechEnd = Number(sil.start.toFixed(3));
      }
    }

    // Independent Onset & Offset anchoring against detected VAD speech islands
    if (speechIntervals.length > 0) {
      const overlappingSpeech = speechIntervals.filter(
        (sp) => sp.end > speechStart + 0.03 && sp.start < speechEnd - 0.03
      );
      if (overlappingSpeech.length > 0) {
        const firstSpeechOnset = overlappingSpeech[0].start;
        const lastSpeechOffset = overlappingSpeech[overlappingSpeech.length - 1].end;
        // Do not let subtitle appear before actual detected speech onset
        if (firstSpeechOnset > speechStart && firstSpeechOnset < speechEnd - 0.1) {
          speechStart = Number(firstSpeechOnset.toFixed(3));
        }
        // Do not let subtitle remain after actual detected speech offset
        if (lastSpeechOffset > speechStart + 0.1 && lastSpeechOffset < speechEnd) {
          speechEnd = Number(lastSpeechOffset.toFixed(3));
        }
      }
    }

    return {
      ...seg,
      startTime: speechStart,
      endTime: speechEnd,
      speechStartTime: speechStart,
      speechEndTime: speechEnd,
    };
  });
}

/**
 * Applies the selected TimingMode to subtitle segments under the strict Speech-Only Synchronization Law:
 * - NO SPEECH = NO SUBTITLE
 * - SPEECH STARTS = SUBTITLE APPEARS
 * - SPEECH ENDS = SUBTITLE DISAPPEARS
 * Never uses fixed minimum subtitle durations and never extends subtitles into silence for readability.
 */
export function applyTimingModeToSegments(
  segments: SubtitleSegment[],
  mode: TimingMode,
  options: {
    minDurationSec?: number;
    maxDurationSec?: number;
    silenceIntervals?: SilenceInterval[];
  } = {}
): SubtitleSegment[] {
  const sorted = [...segments].sort((a, b) => a.startTime - b.startTime);
  const silences = options.silenceIntervals ?? [];

  return sorted.map((seg, idx) => {
    const nextSeg = sorted[idx + 1];
    const speechStart = seg.speechStartTime ?? seg.verifiedStartTime ?? seg.startTime;
    const speechEnd = seg.speechEndTime ?? seg.verifiedEndTime ?? seg.endTime;

    if (mode === 'manual') {
      return {
        ...seg,
        index: idx + 1,
      };
    }

    // Both 'exact_speech' (Default) and 'readability' strictly obey the actual speech timeline:
    // Never start before speechStart, never remain after speechEnd, and never bleed into genuine silence.
    let exactStart = speechStart;
    let exactEnd = speechEnd;

    for (const sil of silences) {
      if (sil.duration < 0.25) continue;
      if (
        exactStart >= sil.start - 0.04 &&
        exactStart < sil.end - 0.02 &&
        exactEnd > sil.end + 0.08
      ) {
        exactStart = Number(sil.end.toFixed(3));
      }
      if (
        sil.start > exactStart + 0.1 &&
        sil.start < exactEnd &&
        sil.end >= exactEnd - 0.04
      ) {
        exactEnd = Number(sil.start.toFixed(3));
      }
    }

    // Ensure non-overlap with the following spoken segment
    if (nextSeg) {
      const nextStart =
        nextSeg.speechStartTime ?? nextSeg.verifiedStartTime ?? nextSeg.startTime;
      if (exactEnd > nextStart - 0.01) {
        exactEnd = Number(Math.max(exactStart + 0.08, nextStart - 0.015).toFixed(3));
      }
    }

    return {
      ...seg,
      index: idx + 1,
      startTime: Number(exactStart.toFixed(3)),
      endTime: Number(Math.max(exactStart + 0.08, exactEnd).toFixed(3)),
      speechStartTime: Number(exactStart.toFixed(3)),
      speechEndTime: Number(Math.max(exactStart + 0.08, exactEnd).toFixed(3)),
    };
  });
}

/**
 * Dedicated Strict Speech-Only Timestamp Quality Control (QC) Analyzer.
 * Validates for every subtitle segment:
 * 1. startTime matches actual beginning of spoken dialogue (no subtitle before speech).
 * 2. endTime matches actual ending of spoken dialogue (no subtitle after speech ends).
 * 3. No subtitle overlaps a genuine silent interval.
 * 4. No subtitle is displayed outside its corresponding speech interval.
 * 5. Never invents fixed durations; flags uncertain boundaries for manual review.
 */
export function analyzeTimestampQuality(
  segments: SubtitleSegment[],
  silenceIntervals: SilenceInterval[] = [],
  speechIntervals: SpeechInterval[] = []
): TimingIssue[] {
  const issues: TimingIssue[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const prev = i > 0 ? segments[i - 1] : null;
    const duration = seg.endTime - seg.startTime;

    if (seg.startTime < 0) {
      issues.push({
        id: `qc-time-neg-${seg.id}`,
        segmentId: seg.id,
        segmentIndex: seg.index,
        type: 'negative_time',
        severity: 'error',
        message: `စာကြောင်း #${seg.index} ၏ စတင်ချိန်သည် အနုတ်လက္ခဏာ (${seg.startTime}s) ဖြစ်နေပါသည်။`,
        suggestedStartTime: 0,
        suggestedEndTime: Math.max(0.2, seg.endTime),
      });
    }

    if (seg.endTime <= seg.startTime) {
      issues.push({
        id: `qc-time-order-${seg.id}`,
        segmentId: seg.id,
        segmentIndex: seg.index,
        type: 'invalid_order',
        severity: 'error',
        message: `စာကြောင်း #${seg.index} ၏ ပြီးဆုံးချိန် (${formatSrtTimestamp(
          seg.endTime
        )}) သည် စတင်ချိန်ထက် စောနေပါသည် (Manual Review လိုအပ်ပါသည်)။`,
      });
    }

    if (prev && seg.startTime < prev.endTime - 0.005) {
      const cleanStart = Number((prev.endTime + 0.015).toFixed(3));
      issues.push({
        id: `qc-time-overlap-${seg.id}`,
        segmentId: seg.id,
        segmentIndex: seg.index,
        type: 'overlap',
        severity: 'error',
        message: `စာကြောင်း #${seg.index} သည် ရှေ့စာကြောင်း #${prev.index} နှင့် အချိန်ထပ်နေပါသည် (${(
          prev.endTime - seg.startTime
        ).toFixed(2)}s overlap)။`,
        suggestedStartTime: cleanStart,
        suggestedEndTime: Math.max(cleanStart + 0.2, seg.endTime),
      });
    }

    // Rule 1: Check if subtitle appears BEFORE actual speech begins
    if (
      seg.speechStartTime !== undefined &&
      seg.startTime < seg.speechStartTime - 0.03
    ) {
      issues.push({
        id: `qc-time-prespeech-${seg.id}`,
        segmentId: seg.id,
        segmentIndex: seg.index,
        type: 'silence_bleed',
        severity: 'warning',
        message: `စာကြောင်း #${seg.index} သည် စကားစတင်ပြောဆိုချိန် (${formatDisplayTimecode(
          seg.speechStartTime
        )}) မတိုင်မီ ${(seg.speechStartTime - seg.startTime).toFixed(2)}s စော၍ ပေါ်နေပါသည်။`,
        suggestedStartTime: Number(seg.speechStartTime.toFixed(3)),
        suggestedEndTime: seg.endTime,
      });
    }

    // Rule 2 & 4: Check if subtitle overlaps any genuine VAD silence interval (pre-speech, post-speech, or internal silence)
    for (const sil of silenceIntervals) {
      if (sil.duration < 0.35) continue;
      // Bleeds into post-speech silence
      if (
        sil.start > seg.startTime + 0.12 &&
        sil.start < seg.endTime - 0.04 &&
        sil.end >= seg.endTime - 0.05
      ) {
        issues.push({
          id: `qc-time-silence-${seg.id}`,
          segmentId: seg.id,
          segmentIndex: seg.index,
          type: 'silence_bleed',
          severity: 'warning',
          message: `စာကြောင်း #${seg.index} သည် စကားပြောရပ်သွားပြီးနောက် အသံတိတ်ချိန် (${formatDisplayTimecode(
            sil.start
          )}) အတွင်း ဆက်လက်ပေါ်နေပါသည်။`,
          suggestedStartTime: seg.startTime,
          suggestedEndTime: Number(sil.start.toFixed(3)),
        });
        break;
      }
      // Starts inside pre-speech silence
      if (
        seg.startTime >= sil.start - 0.02 &&
        seg.startTime < sil.end - 0.04 &&
        seg.endTime > sil.end + 0.1
      ) {
        issues.push({
          id: `qc-time-presilence-${seg.id}`,
          segmentId: seg.id,
          segmentIndex: seg.index,
          type: 'silence_bleed',
          severity: 'warning',
          message: `စာကြောင်း #${seg.index} သည် စကားမပြောမီ အသံတိတ်ချိန် (${formatDisplayTimecode(
            sil.start
          )}–${formatDisplayTimecode(sil.end)}) အတွင်း စော၍ ပေါ်နေပါသည်။`,
          suggestedStartTime: Number(sil.end.toFixed(3)),
          suggestedEndTime: seg.endTime,
        });
        break;
      }
    }

    // Rule 3: Check if endTime exceeds recorded speechEndTime
    if (
      seg.speechEndTime !== undefined &&
      seg.endTime > seg.speechEndTime + 0.04
    ) {
      issues.push({
        id: `qc-time-speech-end-${seg.id}`,
        segmentId: seg.id,
        segmentIndex: seg.index,
        type: 'silence_bleed',
        severity: 'warning',
        message: `စာကြောင်း #${seg.index} သည် စကားပြောပြီးဆုံးချိန် (${formatDisplayTimecode(
          seg.speechEndTime
        )}) ထက် ${(seg.endTime - seg.speechEndTime).toFixed(2)}s ပိုကြာနေပါသည်။`,
        suggestedStartTime: seg.startTime,
        suggestedEndTime: Number(seg.speechEndTime.toFixed(3)),
      });
    }

    // Rule 6: Check if segment is displayed outside any detected VAD speech interval when speechIntervals are available
    if (speechIntervals.length > 0) {
      const hasSpeechOverlap = speechIntervals.some(
        (sp) => sp.end > seg.startTime + 0.03 && sp.start < seg.endTime - 0.03
      );
      if (!hasSpeechOverlap) {
        issues.push({
          id: `qc-time-nospeech-${seg.id}`,
          segmentId: seg.id,
          segmentIndex: seg.index,
          type: 'silence_bleed',
          severity: 'warning',
          message: `စာကြောင်း #${seg.index} သည် စကားပြောသံ မရှိသော အသံတိတ်/နောက်ခံတီးလုံး အပိုင်းတွင် ဖြစ်နေနိုင်ပါသည် (Manual Review စစ်ဆေးပါ)။`,
        });
      }
    }

    if (duration > 8.0) {
      issues.push({
        id: `qc-time-long-${seg.id}`,
        segmentId: seg.id,
        segmentIndex: seg.index,
        type: 'too_long',
        severity: 'warning',
        message: `စာကြောင်း #${seg.index} ပြသချိန် (${duration.toFixed(
          1
        )}s) သည် အလွန်ရှည်လျားနေပါသည် (နှစ်ပိုင်းခွဲရန် အကြံပြုပါသည်)။`,
      });
    }
  }

  // Check for unexplained gaps where VAD detected continuous speech (>= 1.2s) but no subtitle exists
  for (const sp of speechIntervals) {
    if (sp.end - sp.start < 1.2) continue;
    const covered = segments.some(
      (s) => s.endTime > sp.start + 0.2 && s.startTime < sp.end - 0.2
    );
    if (!covered && segments.length > 0) {
      issues.push({
        id: `qc-time-gap-${sp.start}`,
        segmentId: segments[0].id,
        segmentIndex: 1,
        type: 'unexplained_gap',
        severity: 'warning',
        message: `အသံလှိုင်း (${formatDisplayTimecode(sp.start)} – ${formatDisplayTimecode(
          sp.end
        )}) အတွင်း စကားပြောသံရှိသော်လည်း စာတန်းထိုး မပါဝင်သေးပါ။`,
      });
    }
  }

  return issues;
}

/**
 * Dedicated Translation Quality Control (QC) Analyzer.
 * Checks for missing translation, Zawgyi encoding, glossary consistency, excessive lines, and repeated words.
 */
export function analyzeTranslationQuality(
  segments: SubtitleSegment[],
  glossaryTerms: Array<{ source: string; burmese: string }> = [],
  maxLines = 2,
  maxCharsPerLine = 44
): TranslationIssue[] {
  const issues: TranslationIssue[] = [];
  // Common Zawgyi-only codepoints / sequences check
  const zawgyiRegex = /[\u1033\u1034\u105a\u1060-\u1097]/;

  for (const seg of segments) {
    const trans = (seg.translatedText || '').trim();
    const orig = (seg.originalText || '').trim();

    if (!trans) {
      issues.push({
        id: `qc-trans-empty-${seg.id}`,
        segmentId: seg.id,
        segmentIndex: seg.index,
        type: 'missing_translation',
        severity: 'error',
        message: `စာကြောင်း #${seg.index} တွင် မြန်မာဘာသာပြန်စာသား လွတ်နေပါသည်။`,
        suggestedText: orig,
      });
      continue;
    }

    if (zawgyiRegex.test(trans)) {
      issues.push({
        id: `qc-trans-zawgyi-${seg.id}`,
        segmentId: seg.id,
        segmentIndex: seg.index,
        type: 'zawgyi_detected',
        severity: 'error',
        message: `စာကြောင်း #${seg.index} တွင် Zawgyi စာလုံးပုံစံ ပါဝင်နေနိုင်ပါသည် (Myanmar Unicode သာ အသုံးပြုရန်)။`,
      });
    }

    const lines = trans.split('\n').filter(Boolean);
    const longestLine = lines.reduce((m, l) => Math.max(m, l.length), 0);
    if (lines.length > maxLines || (lines.length === 1 && longestLine > maxCharsPerLine + 6)) {
      issues.push({
        id: `qc-trans-len-${seg.id}`,
        segmentId: seg.id,
        segmentIndex: seg.index,
        type: 'excessive_length',
        severity: 'warning',
        message: `စာကြောင်း #${seg.index} သည် စာကြောင်းရေ သို့မဟုတ် အလျား ရှည်လျားနေပါသည် (${lines.length} ကြောင်း၊ ${longestLine} လုံး)။`,
        suggestedText: wrapSubtitleLines(trans, maxLines, maxCharsPerLine),
      });
    }

    // Check glossary consistency
    for (const term of glossaryTerms) {
      if (
        term.source &&
        term.burmese &&
        orig.toLowerCase().includes(term.source.toLowerCase()) &&
        !trans.includes(term.burmese)
      ) {
        issues.push({
          id: `qc-trans-glossary-${seg.id}-${term.source}`,
          segmentId: seg.id,
          segmentIndex: seg.index,
          type: 'inconsistent_glossary',
          severity: 'warning',
          message: `စာကြောင်း #${seg.index} တွင် "${term.source}" အတွက် သတ်မှတ်ထားသော "${term.burmese}" အသုံးအနှုန်း မပါဝင်ပါ။`,
        });
      }
    }

    // Check accidental repeated words/phrases
    const repeatedMatch = trans.match(/(\S{2,})\s+\1\s+\1/);
    if (repeatedMatch) {
      issues.push({
        id: `qc-trans-repeat-${seg.id}`,
        segmentId: seg.id,
        segmentIndex: seg.index,
        type: 'repeated_words',
        severity: 'warning',
        message: `စာကြောင်း #${seg.index} တွင် "${repeatedMatch[1]}" စကားလုံး အကြိမ်ရေများစွာ ထပ်နေပါသည်။`,
        suggestedText: trans.replace(/(\S{2,})(\s+\1){2,}/g, '$1'),
      });
    }
  }

  return issues;
}

/**
 * Validates and normalizes subtitle timing so segments are chronological,
 * non-overlapping, strictly clamped to speech intervals (never extending into silence),
 * and max 2 lines. If a boundary is invalid and cannot be determined, flags it for manual review.
 */
export function normalizeAndValidateSegments(
  segments: SubtitleSegment[],
  options: {
    maxLines?: number;
    maxCharsPerLine?: number;
    minDuration?: number;
    silenceIntervals?: SilenceInterval[];
    speechIntervals?: SpeechInterval[];
  } = {}
): { normalized: SubtitleSegment[]; issues: TimingIssue[] } {
  const maxLines = options.maxLines ?? 2;
  const maxCharsPerLine = options.maxCharsPerLine ?? 44;
  const silences = options.silenceIntervals ?? [];

  const sorted = [...segments].sort((a, b) => a.startTime - b.startTime);
  const normalized: SubtitleSegment[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const current = { ...sorted[i] };
    current.index = i + 1;

    if (current.startTime < 0) current.startTime = 0;
    if (current.endTime <= current.startTime) {
      // Do NOT invent a long fixed duration; use word/speech end if present, or minimal 0.25s + flag for manual review
      const fallbackEnd =
        current.speechEndTime && current.speechEndTime > current.startTime
          ? current.speechEndTime
          : Number((current.startTime + 0.25).toFixed(3));
      current.endTime = fallbackEnd;
      current.verificationLabel = 'needs_review';
    }

    // Clamp against confirmed VAD silence intervals so no subtitle remains visible during silence
    for (const sil of silences) {
      if (sil.duration < 0.25) continue;
      if (
        current.startTime >= sil.start - 0.04 &&
        current.startTime < sil.end - 0.02 &&
        current.endTime > sil.end + 0.08
      ) {
        current.startTime = Number(sil.end.toFixed(3));
      }
      if (
        sil.start > current.startTime + 0.1 &&
        sil.start < current.endTime &&
        sil.end >= current.endTime - 0.04
      ) {
        current.endTime = Number(sil.start.toFixed(3));
      }
    }

    if (i > 0) {
      const prev = normalized[i - 1];
      if (current.startTime < prev.endTime) {
        const gapMid = Number(((prev.endTime + current.startTime) / 2).toFixed(3));
        if (gapMid > prev.startTime + 0.15) {
          prev.endTime = gapMid;
          prev.speechEndTime = gapMid;
          current.startTime = Number((gapMid + 0.015).toFixed(3));
          current.speechStartTime = current.startTime;
        } else {
          current.startTime = Number((prev.endTime + 0.015).toFixed(3));
          current.speechStartTime = current.startTime;
        }
        if (current.endTime <= current.startTime) {
          current.endTime = Number((current.startTime + 0.25).toFixed(3));
          current.verificationLabel = 'needs_review';
        }
      }
    }

    const lines = current.translatedText.split('\n').filter(Boolean);
    if (
      lines.length > maxLines ||
      (lines.length === 1 && current.translatedText.length > maxCharsPerLine)
    ) {
      current.translatedText = wrapSubtitleLines(
        current.translatedText,
        maxLines,
        maxCharsPerLine
      );
    }

    normalized.push(current);
  }

  const issues = analyzeTimestampQuality(
    normalized,
    options.silenceIntervals,
    options.speechIntervals
  );
  return { normalized, issues };
}

function getSegmentBodyText(
  seg: SubtitleSegment,
  mode: 'translated' | 'original' | 'bilingual'
): string {
  if (mode === 'translated') {
    return (seg.translatedText || seg.originalText).trim();
  }
  if (mode === 'original') {
    return (seg.originalText || seg.translatedText).trim();
  }
  const orig = seg.originalText.trim();
  const trans = seg.translatedText.trim();
  return orig && trans ? `${trans}\n${orig}` : trans || orig;
}

/**
 * Generates standard UTF-8 SRT file content from subtitle segments
 */
export function generateSrtContent(
  segments: SubtitleSegment[],
  mode: 'translated' | 'original' | 'bilingual' = 'translated'
): string {
  const sorted = [...segments]
    .filter((s) => (s.translatedText || s.originalText).trim().length > 0)
    .sort((a, b) => a.startTime - b.startTime);

  return (
    sorted
      .map((seg, idx) => {
        const seq = idx + 1;
        const start = formatSrtTimestamp(seg.startTime);
        const end = formatSrtTimestamp(seg.endTime);
        const body = getSegmentBodyText(seg, mode);
        return `${seq}\n${start} --> ${end}\n${body}`;
      })
      .join('\n\n') + '\n'
  );
}

/**
 * Generates standard UTF-8 WebVTT (.vtt) file content from subtitle segments
 */
export function generateVttContent(
  segments: SubtitleSegment[],
  mode: 'translated' | 'original' | 'bilingual' = 'translated'
): string {
  const sorted = [...segments]
    .filter((s) => (s.translatedText || s.originalText).trim().length > 0)
    .sort((a, b) => a.startTime - b.startTime);

  const cues = sorted
    .map((seg, idx) => {
      const seq = idx + 1;
      const start = formatVttTimestamp(seg.startTime);
      const end = formatVttTimestamp(seg.endTime);
      const body = getSegmentBodyText(seg, mode);
      return `${seq}\n${start} --> ${end}\n${body}`;
    })
    .join('\n\n');

  return `WEBVTT\nKind: captions\nLanguage: my\n\n${cues}\n`;
}

/**
 * Generates Advanced SubStation Alpha (.ass) UTF-8 subtitle content with Myanmar Unicode styling
 */
export function generateAssContent(
  segments: SubtitleSegment[],
  mode: 'translated' | 'original' | 'bilingual' = 'translated',
  title = 'MingalarSub Studio Burmese Subtitles',
  style?: {
    fontSize?: 'sm' | 'md' | 'lg';
    textColor?: string;
    bgOpacity?: number;
    outlineStyle?: 'drop_shadow' | 'box' | 'outline';
  }
): string {
  const sorted = [...segments]
    .filter((s) => (s.translatedText || s.originalText).trim().length > 0)
    .sort((a, b) => a.startTime - b.startTime);

  const fontSizeNum = style?.fontSize === 'sm' ? 46 : style?.fontSize === 'lg' ? 64 : 54;
  const borderStyle = style?.outlineStyle === 'box' ? 3 : 1;

  // Convert hex #RRGGBB to ASS &H00BBGGRR
  const hexToAssBgr = (hex?: string) => {
    const clean = (hex || '#FFFFFF').replace('#', '');
    if (clean.length === 6) {
      const r = clean.slice(0, 2);
      const g = clean.slice(2, 4);
      const b = clean.slice(4, 6);
      return `&H00${b}${g}${r}`;
    }
    return '&H00FFFFFF';
  };
  const primaryCol = hexToAssBgr(style?.textColor);

  const header = `[Script Info]
; Script generated by MingalarSub AI Auto Subtitle Studio
Title: ${title}
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Padauk,${fontSizeNum},${primaryCol},&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,${borderStyle},2.5,1.5,2,40,40,48,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const events = sorted
    .map((seg) => {
      const start = formatAssTimestamp(seg.startTime);
      const end = formatAssTimestamp(seg.endTime);
      const speaker = (seg.speaker || '').replace(/,/g, ' ');
      const body = getSegmentBodyText(seg, mode).replace(/\r?\n/g, '\\N');
      return `Dialogue: 0,${start},${end},Default,${speaker},0,0,0,,${body}`;
    })
    .join('\n');

  return `${header}\n${events}\n`;
}

/**
 * Exports subtitle content in SRT, VTT, or ASS format
 */
export function exportSubtitleContent(
  segments: SubtitleSegment[],
  format: SubtitleExportFormat = 'srt',
  mode: 'translated' | 'original' | 'bilingual' = 'translated',
  title?: string,
  style?: {
    fontSize?: 'sm' | 'md' | 'lg';
    textColor?: string;
    bgOpacity?: number;
    outlineStyle?: 'drop_shadow' | 'box' | 'outline';
  }
): { content: string; extension: string; mimeType: string } {
  if (format === 'vtt') {
    return {
      content: generateVttContent(segments, mode),
      extension: '.vtt',
      mimeType: 'text/vtt;charset=utf-8',
    };
  }
  if (format === 'ass') {
    return {
      content: generateAssContent(segments, mode, title, style),
      extension: '.ass',
      mimeType: 'text/plain;charset=utf-8',
    };
  }
  return {
    content: generateSrtContent(segments, mode),
    extension: '.srt',
    mimeType: 'text/plain;charset=utf-8',
  };
}

/**
 * Parses a standard SRT or WebVTT string into SubtitleSegment[]
 */
export function parseSrtContent(srtText: string): SubtitleSegment[] {
  const clean = srtText
    .replace(/\r\n/g, '\n')
    .replace(/^WEBVTT[^\n]*\n(?:[^\n]+:\s*[^\n]+\n)*/i, '')
    .trim();
  if (!clean) return [];

  const blocks = clean.split(/\n\s*\n/);
  const result: SubtitleSegment[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i]
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) continue;

    let timeLineIdx = 0;
    if (/^\d+$/.test(lines[0]) && lines[1]?.includes('-->')) {
      timeLineIdx = 1;
    } else if (lines[0].includes('-->')) {
      timeLineIdx = 0;
    } else {
      continue;
    }

    const timeParts = lines[timeLineIdx].split('-->');
    if (timeParts.length !== 2) continue;

    const startTime = parseSrtTimestamp(timeParts[0].trim().split(' ')[0]);
    const endTime = parseSrtTimestamp(timeParts[1].trim().split(' ')[0]);
    if (startTime === null || endTime === null) continue;

    const textLines = lines.slice(timeLineIdx + 1);
    const text = textLines.join('\n');

    result.push({
      id: `seg-${i + 1}-${Date.now()}`,
      index: result.length + 1,
      startTime,
      endTime,
      speechStartTime: startTime,
      speechEndTime: endTime,
      originalText: text,
      translatedText: text,
    });
  }

  return result;
}

/**
 * Performs search and replace across subtitle segments
 */
export function searchAndReplaceSegments(
  segments: SubtitleSegment[],
  searchQuery: string,
  replaceWith: string,
  targetField: 'translated' | 'original' | 'both' = 'translated',
  caseSensitive = false
): { updatedSegments: SubtitleSegment[]; replacementsCount: number } {
  if (!searchQuery) {
    return { updatedSegments: segments, replacementsCount: 0 };
  }

  const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flags = caseSensitive ? 'g' : 'gi';
  const regex = new RegExp(escaped, flags);
  let replacementsCount = 0;

  const updatedSegments = segments.map((seg) => {
    let translatedText = seg.translatedText;
    let originalText = seg.originalText;

    if (targetField === 'translated' || targetField === 'both') {
      const matches = translatedText.match(regex);
      if (matches) {
        replacementsCount += matches.length;
        translatedText = translatedText.replace(regex, replaceWith);
      }
    }

    if (targetField === 'original' || targetField === 'both') {
      const matches = originalText.match(regex);
      if (matches) {
        replacementsCount += matches.length;
        originalText = originalText.replace(regex, replaceWith);
      }
    }

    return {
      ...seg,
      translatedText,
      originalText,
    };
  });

  return { updatedSegments, replacementsCount };
}

/**
 * Splits a single subtitle segment at its speech/word midpoint into two sequential segments
 */
export function splitSubtitleSegment(
  segments: SubtitleSegment[],
  segmentId: string
): SubtitleSegment[] {
  const idx = segments.findIndex((s) => s.id === segmentId);
  if (idx === -1) return segments;

  const target = segments[idx];
  const duration = target.endTime - target.startTime;
  if (duration < 0.6) return segments;

  let splitTime = Number((target.startTime + duration / 2).toFixed(3));
  let firstWords: WordTimestamp[] | undefined;
  let secondWords: WordTimestamp[] | undefined;

  if (target.words && target.words.length >= 2) {
    const midWordIdx = Math.floor(target.words.length / 2);
    firstWords = target.words.slice(0, midWordIdx);
    secondWords = target.words.slice(midWordIdx);
    splitTime = Number(firstWords[firstWords.length - 1].end.toFixed(3));
  }

  const splitTextHalves = (txt: string): [string, string] => {
    const clean = txt.trim();
    if (!clean) return ['', ''];
    const lines = clean.split('\n');
    if (lines.length >= 2) {
      const half = Math.ceil(lines.length / 2);
      return [lines.slice(0, half).join(' '), lines.slice(half).join(' ')];
    }
    const wrapped = wrapSubtitleLines(clean, 2, Math.max(12, Math.floor(clean.length / 2)));
    const parts = wrapped.split('\n');
    if (parts.length >= 2) {
      return [parts[0], parts.slice(1).join(' ')];
    }
    return [clean, clean];
  };

  const [orig1, orig2] = splitTextHalves(target.originalText);
  const [trans1, trans2] = splitTextHalves(target.translatedText);

  const secondStart =
    secondWords && secondWords.length > 0
      ? Number(secondWords[0].start.toFixed(3))
      : Number((splitTime + 0.02).toFixed(3));

  const firstSeg: SubtitleSegment = {
    ...target,
    endTime: splitTime,
    speechEndTime: splitTime,
    originalText: orig1,
    translatedText: trans1,
    words: firstWords,
  };

  const secondSeg: SubtitleSegment = {
    ...target,
    id: `seg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    startTime: secondStart,
    endTime: target.endTime,
    speechStartTime: secondStart,
    speechEndTime: target.speechEndTime ?? target.endTime,
    originalText: orig2,
    translatedText: trans2,
    words: secondWords,
  };

  const next = [...segments];
  next.splice(idx, 1, firstSeg, secondSeg);
  return next.map((s, i) => ({ ...s, index: i + 1 }));
}

/**
 * Merges a subtitle segment with the immediately following segment
 */
export function mergeSubtitleSegments(
  segments: SubtitleSegment[],
  firstSegmentId: string
): SubtitleSegment[] {
  const idx = segments.findIndex((s) => s.id === firstSegmentId);
  if (idx === -1 || idx >= segments.length - 1) return segments;

  const first = segments[idx];
  const second = segments[idx + 1];

  const mergedOrig = `${first.originalText.trim()} ${second.originalText.trim()}`.trim();
  const mergedTrans = wrapSubtitleLines(
    `${first.translatedText.replace(/\n/g, ' ').trim()} ${second.translatedText
      .replace(/\n/g, ' ')
      .trim()}`.trim(),
    2,
    42
  );

  const mergedSeg: SubtitleSegment = {
    ...first,
    endTime: second.endTime,
    speechStartTime: first.speechStartTime ?? first.startTime,
    speechEndTime: second.speechEndTime ?? second.endTime,
    originalText: mergedOrig,
    translatedText: mergedTrans,
    words:
      first.words || second.words
        ? [...(first.words || []), ...(second.words || [])]
        : undefined,
  };

  const next = [...segments];
  next.splice(idx, 2, mergedSeg);
  return next.map((s, i) => ({ ...s, index: i + 1 }));
}
