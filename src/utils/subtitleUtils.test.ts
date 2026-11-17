import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatSrtTimestamp,
  formatVttTimestamp,
  formatAssTimestamp,
  parseSrtTimestamp,
  normalizeAndValidateSegments,
  generateSrtContent,
  generateVttContent,
  generateAssContent,
  exportSubtitleContent,
  parseSrtContent,
  wrapSubtitleLines,
  deduplicateChunkSegments,
  reconcileSegmentsWithVadAndWords,
  applyTimingModeToSegments,
  analyzeTimestampQuality,
  analyzeTranslationQuality,
  splitSubtitleSegment,
  mergeSubtitleSegments,
} from './subtitleUtils.ts';
import {
  AudioPreprocessor,
  TranscriptValidator,
  AlignmentService,
  AcousticBoundaryService,
  TimestampRefinementService,
  SubtitleComposer,
  QualityAssuranceService,
  type GroundTruthReferenceItem,
} from '../services/subtitlePipelineServices.ts';
import type { SubtitleSegment, SpeechInterval, SilenceInterval } from '../types/subtitle.ts';

describe('subtitleUtils & Ultra-Precision Subtitle Pipeline Services Tests', () => {
  it('formats SRT, VTT, and ASS timestamps accurately', () => {
    assert.equal(formatSrtTimestamp(0), '00:00:00,000');
    assert.equal(formatSrtTimestamp(65.432), '00:01:05,432');
    assert.equal(formatVttTimestamp(65.432), '00:01:05.432');
    assert.equal(formatAssTimestamp(65.43), '0:01:05.43');
  });

  it('parses SRT timestamps back to seconds accurately', () => {
    assert.equal(parseSrtTimestamp('00:00:00,000'), 0);
    assert.equal(parseSrtTimestamp('00:01:05,432'), 65.432);
    assert.equal(parseSrtTimestamp('01:02:03.500'), 3723.5);
  });

  it('prevents overlapping timestamps and preserves chronological order', () => {
    const raw: SubtitleSegment[] = [
      {
        id: 'seg-2',
        index: 2,
        startTime: 3.0,
        endTime: 6.5,
        originalText: 'Second sentence',
        translatedText: 'ဒုတိယဝါကျ',
        confidence: 0.9,
      },
      {
        id: 'seg-1',
        index: 1,
        startTime: 1.0,
        endTime: 3.8,
        originalText: 'First sentence',
        translatedText: 'ပထမဝါကျ',
        confidence: 0.95,
      },
    ];

    const { normalized } = normalizeAndValidateSegments(raw);
    assert.equal(normalized.length, 2);
    assert.equal(normalized[0].id, 'seg-1');
    assert.equal(normalized[1].id, 'seg-2');
    assert.ok(normalized[0].endTime <= normalized[1].startTime);
  });

  it('deduplicates overlapping segments at audio chunk boundaries while preserving non-overlapping speech', () => {
    const chunkedSegments: SubtitleSegment[] = [
      {
        id: 'c0-1',
        index: 1,
        startTime: 0.5,
        endTime: 3.8,
        originalText: 'Welcome to the AI Auto Subtitle Studio.',
        translatedText: '',
        confidence: 0.96,
      },
      {
        id: 'c0-2',
        index: 2,
        startTime: 18.2,
        endTime: 21.4,
        originalText: 'This sentence crosses the chunk boundary.',
        translatedText: '',
        confidence: 0.94,
      },
      {
        id: 'c1-1',
        index: 3,
        startTime: 18.3,
        endTime: 21.5,
        originalText: 'This sentence crosses the chunk boundary.',
        translatedText: '',
        confidence: 0.95,
      },
      {
        id: 'c1-2',
        index: 4,
        startTime: 22.0,
        endTime: 25.5,
        originalText: 'Here is the next distinct sentence.',
        translatedText: '',
        confidence: 0.95,
      },
    ];

    const deduped = deduplicateChunkSegments(chunkedSegments);
    assert.equal(deduped.length, 3);
    assert.equal(deduped[0].originalText, 'Welcome to the AI Auto Subtitle Studio.');
    assert.equal(deduped[1].originalText, 'This sentence crosses the chunk boundary.');
    assert.equal(deduped[2].originalText, 'Here is the next distinct sentence.');
  });

  it('VAD silence reconciliation trims trailing silence and splits long internal pauses (>= 0.75s) while keeping short natural pauses', () => {
    const rawSegments = [
      {
        startTime: 0.2,
        endTime: 4.9,
        originalText: 'Hello everyone, welcome back.',
        words: [
          { word: 'Hello', start: 0.5, end: 1.0 },
          { word: 'everyone,', start: 1.05, end: 1.8 },
          { word: 'welcome', start: 2.1, end: 2.9 },
          { word: 'back.', start: 2.95, end: 3.75 },
        ],
      },
      {
        startTime: 5.2,
        endTime: 13.8,
        originalText: 'First part of speech. Second part after long silence.',
        words: [
          { word: 'First', start: 5.25, end: 5.8 },
          { word: 'part', start: 5.85, end: 6.4 },
          { word: 'of', start: 6.45, end: 7.0 },
          { word: 'speech.', start: 7.05, end: 8.55 },
          { word: 'Second', start: 10.2, end: 10.9 },
          { word: 'part', start: 10.95, end: 11.6 },
          { word: 'after', start: 11.65, end: 12.4 },
          { word: 'long', start: 12.45, end: 13.0 },
          { word: 'silence.', start: 13.05, end: 13.75 },
        ],
      },
    ];

    const silenceIntervals: SilenceInterval[] = [
      { start: 0, end: 0.5, duration: 0.5 },
      { start: 3.8, end: 5.2, duration: 1.4 },
      { start: 8.6, end: 10.2, duration: 1.6 },
      { start: 13.8, end: 15.0, duration: 1.2 },
    ];
    const speechIntervals: SpeechInterval[] = [
      { start: 0.5, end: 3.8 },
      { start: 5.2, end: 8.6 },
      { start: 10.2, end: 13.8 },
    ];

    const reconciled = reconcileSegmentsWithVadAndWords(rawSegments, silenceIntervals, speechIntervals);
    assert.equal(reconciled.length, 3);
    assert.ok(reconciled[0].startTime >= 0.45 && reconciled[0].endTime <= 3.85);
    assert.ok(reconciled[1].endTime <= 8.65);
    assert.ok(reconciled[2].startTime >= 10.15);
  });

  it('AudioPreprocessor analyzes loudness, noise floor, adaptive VAD threshold, and A/V stream offsets', () => {
    const metrics = AudioPreprocessor.analyzeSignalAndSyncMetrics({
      waveformPeaks: [0.04, 0.05, 0.55, 0.72, 0.05, 0.68],
      sampleRate: 16000,
      channels: 1,
      audioCodec: 'pcm_s16le',
      videoStartOffsetSec: 0.02,
      audioStartOffsetSec: 0.06,
      videoDurationSec: 15.0,
      audioDurationSec: 15.0,
      frameRateFps: 24,
      isVariableFrameRate: false,
    });

    assert.equal(metrics.sampleRate, 16000);
    assert.ok(metrics.noiseFloorDb < metrics.adaptiveVadThresholdDb);
    assert.equal(AudioPreprocessor.compensatePresentationTimeline(1.0, 0.06, 0.02), 1.04);
  });

  it('TranscriptValidator cleans hallucinated word loops, merges higher-confidence Pass B, and assigns stable word IDs', () => {
    const passA = [
      {
        startTime: 0.5,
        endTime: 3.5,
        originalText: 'Wait wait wait wait wait look closely.',
        confidence: 0.72,
      },
    ];
    const passB = [
      {
        startTime: 0.5,
        endTime: 3.5,
        originalText: 'Wait, look closely at the mural.',
        confidence: 0.94,
        words: [
          { word: 'Wait,', start: 0.5, end: 1.0 },
          { word: 'look', start: 1.1, end: 1.6 },
          { word: 'closely', start: 1.65, end: 2.3 },
          { word: 'at', start: 2.35, end: 2.6 },
          { word: 'the', start: 2.65, end: 2.9 },
          { word: 'mural.', start: 2.95, end: 3.5 },
        ],
      },
    ];

    const result = TranscriptValidator.validateAndCleanTranscript(passA, passB);
    assert.equal(result.retranscribedCount, 1);
    assert.equal(result.verifiedSegments[0].originalText, 'Wait, look closely at the mural.');
    assert.equal(result.verifiedSegments[0].words?.[0].id, 'w-0001-01');
  });

  it('AlignmentService distinguishes supported phoneme languages vs unsupported multilingual fallback and never uses equal char split', () => {
    assert.equal(AlignmentService.isPhonemeAlignmentSupported('en'), true);
    assert.equal(AlignmentService.isPhonemeAlignmentSupported('ja'), true);
    assert.equal(AlignmentService.isPhonemeAlignmentSupported('fi'), false);

    // Compare diphthong-rich word ("mountain") vs consonant-stop word ("strict") of similar character length
    const d1 = AlignmentService.decomposeWordToPhonemes('mountain', 'en');
    const d2 = AlignmentService.decomposeWordToPhonemes('strict', 'en');
    assert.notEqual(d1.acousticWeight, d2.acousticWeight, 'Phonetic acoustic weight must reflect vowel nuclei, not equal char count');

    const unsupportedAligned = AlignmentService.alignSegmentWordsAndPhonemes({
      segmentId: 'seg-0001',
      segmentIndex: 1,
      originalText: 'Hei maailma',
      asrStartTime: 1.0,
      asrEndTime: 3.0,
      languageCode: 'fi',
      waveformPeaks: [0.5, 0.6, 0.5],
      totalDurationSec: 5.0,
      speechIntervals: [{ start: 1.0, end: 3.0 }],
    });
    assert.equal(unsupportedAligned.languageSupportMode, 'multilingual_acoustic_fallback');
    assert.equal(unsupportedAligned.alignedWords[0].verificationLabel, 'needs_review');
  });

  it('TimestampRefinementService preserves immutable original timestamps, records correctionHistory, and separates layers via SubtitleComposer', () => {
    const { alignmentRecords, iterationsRun } = TimestampRefinementService.runIterativeRefinement({
      rawSegments: [
        {
          startTime: 0.25, // starts 0.25s early inside silence [0, 0.5]
          endTime: 4.2, // bleeds 0.4s into silence [3.8, 5.2]
          originalText: 'Morning mist over Bagan.',
          confidence: 0.95,
        },
      ],
      silenceIntervals: [
        { start: 0.0, end: 0.5, duration: 0.5 },
        { start: 3.8, end: 5.2, duration: 1.4 },
      ],
      speechIntervals: [{ start: 0.5, end: 3.8 }],
      waveformPeaks: [0.05, 0.75, 0.82, 0.04],
      totalDurationSec: 5.2,
      languageCode: 'en',
      processingMode: 'maximum_accuracy',
    });

    assert.ok(iterationsRun >= 1);
    assert.equal(alignmentRecords[0].originalStartTime, 0.25, 'Original ASR start time must remain immutable');
    assert.equal(alignmentRecords[0].originalEndTime, 4.2, 'Original ASR end time must remain immutable');
    assert.equal(alignmentRecords[0].verifiedStartTime, 0.5, 'Verified start time must snap to speech onset');
    assert.equal(alignmentRecords[0].verifiedEndTime, 3.8, 'Verified end time must snap to speech offset before silence');
    assert.ok(alignmentRecords[0].correctionHistory.length >= 2, 'Correction history must log refinement steps');

    const composed = SubtitleComposer.composeSegmentsFromLayers(
      alignmentRecords,
      [
        {
          segmentId: alignmentRecords[0].segmentId,
          translatedText: 'ပုဂံလွင်ပြင်ပေါ်က မနက်ခင်းမြူခိုးများ။',
          terminologyUsed: ['ပုဂံ'],
          qualityStatus: 'verified',
        },
      ],
      'exact_speech',
      {
        silenceIntervals: [{ start: 3.8, end: 5.2, duration: 1.4 }],
      }
    );

    // Updating Burmese translation must NEVER change speech timestamps
    const afterTransEdit = SubtitleComposer.updateTranslationPreservingTimestamps(
      composed,
      composed[0].id,
      'ပြင်ဆင်ထားသော မြန်မာစာတန်းထိုး။'
    );
    assert.equal(afterTransEdit[0].startTime, 0.5);
    assert.equal(afterTransEdit[0].endTime, 3.8);
    assert.equal(afterTransEdit[0].originalStartTime, 0.25);

    // Updating timestamp must NEVER rewrite Burmese translation and must append to correctionHistory
    const afterTimeEdit = SubtitleComposer.updateTimestampPreservingTranslation(
      afterTransEdit,
      composed[0].id,
      0.55,
      3.75
    );
    assert.equal(afterTimeEdit[0].translatedText, 'ပြင်ဆင်ထားသော မြန်မာစာတန်းထိုး။');
    assert.equal(afterTimeEdit[0].originalStartTime, 0.25);
    assert.ok(
      afterTimeEdit[0].correctionHistory!.some((h) => h.stage === 'user_manual'),
      'Manual edit must be recorded in correctionHistory'
    );
  });

  it('QualityAssuranceService evaluates ground-truth benchmark metrics (MAE, Median, P90, P95, tolerance %, omission, overlap)', () => {
    const validationSamples: GroundTruthReferenceItem[] = [
      {
        id: 'val-1',
        category: 'documentary',
        language: 'en',
        noiseCondition: 'clean',
        speechSpeed: 'normal',
        referenceStart: 0.5,
        referenceEnd: 3.8,
        predictedStart: 0.52, // 20ms error
        predictedEnd: 3.77, // 30ms error
      },
      {
        id: 'val-2',
        category: 'anime',
        language: 'ja',
        noiseCondition: 'background_music',
        speechSpeed: 'fast',
        referenceStart: 5.2,
        referenceEnd: 8.6,
        predictedStart: 5.24, // 40ms error
        predictedEnd: 8.52, // 80ms error
      },
      {
        id: 'val-3',
        category: 'interview',
        language: 'en',
        noiseCondition: 'moderate_noise',
        speechSpeed: 'normal',
        referenceStart: 10.2,
        referenceEnd: 13.8,
        predictedStart: 10.21, // 10ms error
        predictedEnd: 13.78, // 20ms error
      },
    ];

    const metrics = QualityAssuranceService.evaluateBenchmarkAccuracy(validationSamples);
    assert.equal(metrics.sampleCount, 3);
    assert.ok(metrics.wordBoundaryMaeMs > 0 && metrics.wordBoundaryMaeMs < 50);
    assert.ok(metrics.medianBoundaryErrorMs <= 35);
    assert.ok(metrics.within100msPct === 100);
    assert.equal(metrics.speechOmissionRate, 0);
    assert.equal(metrics.subtitleOverlapRate, 0);
  });

  it('generates valid SRT, WebVTT, and SubStation Alpha (ASS) subtitle files with Burmese Unicode', () => {
    const segments: SubtitleSegment[] = [
      {
        id: 'seg-1',
        index: 1,
        startTime: 0.5,
        endTime: 3.8,
        originalText: 'Welcome to AI Auto Subtitle Studio.',
        translatedText: 'AI အလိုအလျောက် စာတန်းထိုးစတူဒီယိုမှ ကြိုဆိုပါတယ်။',
        confidence: 0.98,
      },
    ];

    const srt = generateSrtContent(segments, 'translated');
    assert.ok(srt.includes('00:00:00,500 --> 00:00:03,800'));
    assert.ok(srt.includes('AI အလိုအလျောက် စာတန်းထိုးစတူဒီယိုမှ ကြိုဆိုပါတယ်။'));

    const vtt = generateVttContent(segments, 'translated');
    assert.ok(vtt.startsWith('WEBVTT'));
    assert.ok(vtt.includes('00:00:00.500 --> 00:00:03.800'));

    const ass = generateAssContent(segments, 'translated');
    assert.ok(ass.includes('[Script Info]'));
    assert.ok(ass.includes('Style: Default,Padauk'));
    assert.ok(ass.includes('Dialogue: 0,0:00:00.50,0:00:03.80,Default'));

    assert.equal(exportSubtitleContent(segments, 'vtt', 'translated').content, vtt);
    assert.equal(exportSubtitleContent(segments, 'ass', 'translated').content, ass);

    const parsed = parseSrtContent(srt);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].startTime, 0.5);
    assert.equal(parsed[0].endTime, 3.8);
  });

  it('filters out background music, sound effects, and environmental noise captions unless explicitly requested', () => {
    const rawWithMusicAndSfx = [
      {
        startTime: 0.0,
        endTime: 2.0,
        originalText: '[Music]',
      },
      {
        startTime: 2.1,
        endTime: 3.2,
        originalText: '♪ ♫ ♪',
      },
      {
        startTime: 3.5,
        endTime: 6.2,
        originalText: '[Music] Look at the ancient temple. (applause)',
      },
      {
        startTime: 6.3,
        endTime: 7.5,
        originalText: '[Sound Effect]',
      },
    ];

    const cleaned = TranscriptValidator.validateAndCleanTranscript(rawWithMusicAndSfx, [], false);
    assert.equal(cleaned.verifiedSegments.length, 1);
    assert.equal(cleaned.verifiedSegments[0].originalText, 'Look at the ancient temple.');
    assert.equal(cleaned.hallucinationsRemoved, 3);
  });

  it('enforces SPEECH-ONLY synchronization without fixed duration padding or readability extensions into silence, and flags uncertain boundaries for manual review', () => {
    const shortSpokenSegment: SubtitleSegment[] = [
      {
        id: 'seg-short-1',
        index: 1,
        startTime: 1.0,
        endTime: 1.32, // Short 0.32s utterance ("Yes!") followed immediately by silence [1.32, 3.0]
        speechStartTime: 1.0,
        speechEndTime: 1.32,
        originalText: 'Yes!',
        translatedText: 'ဟုတ်ကဲ့။',
      },
    ];

    const silences: SilenceInterval[] = [{ start: 1.32, end: 3.0, duration: 1.68 }];

    const exactResult = applyTimingModeToSegments(shortSpokenSegment, 'exact_speech', {
      silenceIntervals: silences,
    });
    const readabilityResult = applyTimingModeToSegments(shortSpokenSegment, 'readability', {
      silenceIntervals: silences,
    });

    // Neither mode is allowed to artificially pad 0.32s into silence [1.32, 3.0]
    assert.equal(exactResult[0].startTime, 1.0);
    assert.equal(exactResult[0].endTime, 1.32);
    assert.equal(readabilityResult[0].startTime, 1.0);
    assert.equal(readabilityResult[0].endTime, 1.32);

    // Uncertain boundary with no corroborating VAD speech is flagged for manual review instead of inventing a long timestamp
    const uncertainCheck = AcousticBoundaryService.detectIndependentOnsetAndOffset({
      candidateStart: 4.0,
      candidateEnd: 4.5,
      classifiedSilences: [{ start: 0, end: 5.0, duration: 5.0, kind: 'long_silence' }],
      verifiedSpeech: [{ start: 0.5, end: 2.0, speechProbability: 0.95 }],
      waveformPeaks: [0.02, 0.02, 0.02],
      totalDurationSec: 5.0,
    });
    assert.equal(uncertainCheck.uncertainBoundary, true);
  });

  it('enforces zero demo jobs, official Gemini model defaults, custom ASS style export, and silence violation QA metrics', async () => {
    const { INITIAL_DEMO_JOBS, DEFAULT_SETTINGS } = await import('./demoData.ts');
    assert.equal(INITIAL_DEMO_JOBS.length, 0, 'INITIAL_DEMO_JOBS must be empty (zero demo jobs)');
    assert.equal(DEFAULT_SETTINGS.modelName, 'gemini-3.1-pro-preview');
    assert.equal(DEFAULT_SETTINGS.processingMode, 'maximum_accuracy');

    const segments: SubtitleSegment[] = [
      {
        id: 'seg-style-1',
        index: 1,
        startTime: 1.0,
        endTime: 3.0,
        originalText: 'Custom ASS style test.',
        translatedText: 'စာတန်းထိုး ဒီဇိုင်း စမ်းသပ်ချက်။',
        speaker: 'Speaker 1',
        verificationLabel: 'verified',
      },
    ];

    const customAss = exportSubtitleContent(segments, 'ass', 'translated', 'Test.mp4', {
      fontSize: 'lg',
      textColor: '#A7F3D0',
      bgOpacity: 85,
      outlineStyle: 'box',
    });
    assert.ok(customAss.content.includes('Style: Default,Padauk,64,&H00D0F3A7'));
    assert.ok(customAss.content.includes(',3,2.5,1.5,2,'));

    const qa = QualityAssuranceService.runFinalQaValidation({
      segments,
      silenceIntervals: [{ start: 0, end: 1.0, duration: 1.0 }],
      speechIntervals: [{ start: 1.0, end: 3.0 }],
    });
    assert.equal(qa.report.detectedSilenceViolations, 0);
    assert.equal(qa.report.exportValidationPassed, true);
  });
});



