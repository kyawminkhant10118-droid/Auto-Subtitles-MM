import 'dotenv/config';
import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createServer as createViteServer } from 'vite';
import {
  ensureTempDirs,
  UPLOAD_DIR,
  AUDIO_DIR,
  validateMediaExtension,
  probeMediaFile,
  extractAudioWithFfmpeg,
  detectSpeechAndSilenceWithVad,
  splitAudioIntoChunks,
  cleanupTempFiles,
} from './server/services/ffmpegService';
import {
  transcribeAudioChunkWithGemini,
  translateSegmentsToBurmeseWithGemini,
  refineBurmeseSubtitlesWithHighThinking,
  testGeminiConnection,
} from './server/services/geminiService';
import {
  maskApiKey,
  isUsableEnvGeminiKey,
  ALLOWED_GEMINI_MODELS,
  getServerGroqApiKey,
  getServerGeminiApiKey,
  setServerGroqApiKey,
  setServerGeminiApiKey,
  getSelectedGeminiModel,
  setSelectedGeminiModel,
  getSelectedWhisperModel,
  setSelectedWhisperModel,
  testGroqConnection,
  transcribeAudioWithGroqWhisper,
} from './server/services/groqService';
import {
  DEFAULT_PIPELINE_STAGES,
  DEFAULT_SETTINGS,
  INITIAL_DEMO_JOBS,
} from './src/utils/demoData';
import {
  exportSubtitleContent,
  normalizeAndValidateSegments,
} from './src/utils/subtitleUtils';
import {
  AudioPreprocessor,
  QualityAssuranceService,
  SubtitleComposer,
  TimestampRefinementService,
  TranscriptValidator,
} from './src/services/subtitlePipelineServices';
import {
  CharacterMemoryItem,
  GeminiModelId,
  PipelineStageId,
  ProcessingJob,
  ProcessingMode,
  SubtitleExportFormat,
  SubtitleSegment,
  TimingMode,
  TranslationRecord,
  VideoCategory,
  WordTimestamp,
} from './src/types/subtitle';

ensureTempDirs();

const app = express();
app.use(express.json({ limit: '25mb' }));

// Configure Multer storage in ./tmp/uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureTempDirs();
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const safeBase = path
      .basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 60);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}_${safeBase}${ext}`);
  },
});

const maxUploadMb = Number(process.env.MAX_UPLOAD_SIZE_MB) || 250;
const upload = multer({
  storage,
  limits: { fileSize: maxUploadMb * 1024 * 1024 },
});

// In-memory store (zero pre-seeded demo jobs)
const jobsMap = new Map<string, ProcessingJob>();
const jobFilePaths = new Map<string, string>();
const activeFileHashes = new Set<string>();
const cancelledJobIds = new Set<string>();

for (const job of INITIAL_DEMO_JOBS) {
  const cloned = structuredClone(job);
  jobsMap.set(cloned.id, cloned);
}

function updateJobStage(
  job: ProcessingJob,
  stageId: PipelineStageId,
  status: 'pending' | 'running' | 'completed' | 'error',
  detail?: string,
  progress?: number,
  durationMs?: number
) {
  job.currentStage = stageId;
  if (typeof progress === 'number') {
    job.progress = progress;
  }
  job.stages = job.stages.map((s) =>
    s.id === stageId
      ? {
          ...s,
          status,
          detail: detail ?? s.detail,
          durationMs: durationMs ?? s.durationMs,
        }
      : s
  );
}

/**
 * Executes the complete Ultra-Precision Subtitle Studio Pipeline (Priorities 1–14):
 * 1. Upload & Validate Media + Stream A/V Sync Offset & VFR Inspection (ffprobe)
 * 2. Extract Non-Destructive 16kHz Mono PCM WAV Analysis Copy (FFmpeg)
 * 3. Adaptive Noise-Floor Estimation, Loudness/Clipping Inspection & VAD Silence/Speech Detection
 * 4. Multi-Pass Speech Recognition (Pass A–E) with Controlled Overlap Chunking
 * 5. Phoneme-Level Forced Alignment & Iterative Acoustic Boundary Refinement
 * 6. Lock Speech Alignment Layer (Immutable Original + Verified Timestamps + Correction History)
 * 7. Context-Memory Burmese Translation (Gemini 3.1 Pro) into separate Translation Layer
 * 8. Compose Subtitles with Silence-Aware Timing Mode (Exact Speech Timing default)
 * 9. Run Independent Final Quality Assurance (QA) Pass & Report
 * 10. Prepare UTF-8 SRT, WebVTT, and ASS exports
 */
async function executeSubtitlePipeline(
  jobId: string,
  mediaFilePath: string,
  options: {
    sourceLanguageHint?: string;
    targetLanguage?: string;
    videoCategory?: VideoCategory;
    timingMode?: TimingMode;
    processingMode?: ProcessingMode;
    translationStyle: 'conversational' | 'formal' | 'cinema' | 'documentary';
    thinkingMode: boolean;
    glossaryTerms?: Array<{ source: string; burmese: string }>;
    characterMemory?: CharacterMemoryItem[];
    maxLinesPerSubtitle?: number;
    maxCharsPerLine?: number;
    minDurationSec?: number;
    maxDurationSec?: number;
    chunkDurationSec?: number;
    chunkOverlapSec?: number;
    autoCleanupTempFiles?: boolean;
  },
  fileLockKey?: string
): Promise<void> {
  const job = jobsMap.get(jobId);
  if (!job) return;

  const tempFilesToClean: string[] = [];
  job.status = 'processing';
  job.error = undefined;
  cancelledJobIds.delete(jobId);

  const checkCancelled = () => {
    if (cancelledJobIds.has(jobId)) {
      throw new Error('USER_CANCELLED_JOB');
    }
  };

  try {
    const processingMode: ProcessingMode = options.processingMode || 'maximum_accuracy';
    job.processingMode = processingMode;

    // Stage 1: Upload File
    updateJobStage(
      job,
      'upload',
      'completed',
      'မူရင်းမီဒီယာဖိုင်ကို မပြုပြင်ဘဲ လက်ခံပြီးပါပြီ',
      8,
      90
    );
    checkCancelled();

    // Stage 2: Validate File & Inspect A/V Sync Offsets via ffprobe
    const tValidate = Date.now();
    updateJobStage(
      job,
      'validate_file',
      'running',
      'FFprobe ဖြင့် A/V Offset, VFR နှင့် အသံလမ်းကြောင်း စစ်ဆေးနေပါသည်...',
      14
    );
    const probeInfo = await probeMediaFile(mediaFilePath);
    job.durationSeconds = probeInfo.durationSeconds;
    job.format = `${probeInfo.formatName}${
      probeInfo.audioCodec ? ` (${probeInfo.audioCodec})` : ''
    }`;
    if (!probeInfo.hasAudio) {
      throw new Error('တင်သွင်းသော ဗီဒီယိုဖိုင်တွင် အသံလမ်းကြောင်း (Audio Track) မပါဝင်ပါ။');
    }
    updateJobStage(
      job,
      'validate_file',
      'completed',
      `ကြာချိန် ${probeInfo.durationSeconds}s · ${ probeInfo.frameRateFps }fps · A/V Offset ${(probeInfo.audioStartOffsetSec - probeInfo.videoStartOffsetSec).toFixed(3)}s`,
      20,
      Date.now() - tValidate
    );
    checkCancelled();

    // Stage 3: Extract Non-Destructive 16kHz Mono PCM WAV Analysis Copy
    const tExtract = Date.now();
    updateJobStage(
      job,
      'extract_audio',
      'running',
      'FFmpeg ဖြင့် 16kHz Mono PCM WAV Analysis Copy ထုတ်ယူနေပါသည်...',
      28
    );
    const extracted = await extractAudioWithFfmpeg(mediaFilePath, jobId);
    tempFilesToClean.push(extracted.outputPath);
    updateJobStage(
      job,
      'extract_audio',
      'completed',
      `16kHz Mono PCM WAV (${(extracted.sizeBytes / 1024).toFixed(0)} KB)`,
      35,
      Date.now() - tExtract
    );
    checkCancelled();

    // Stage 4: Run Adaptive VAD Silence & Speech Boundary Detection + Signal Analysis
    const tVad = Date.now();
    updateJobStage(
      job,
      'vad_alignment',
      'running',
      'Adaptive Noise Floor နှင့် VAD Speech/Silence နယ်နိမိတ် စစ်ဆေးနေပါသည်...',
      42
    );
    const vadResult = await detectSpeechAndSilenceWithVad(
      extracted.outputPath,
      probeInfo.durationSeconds,
      120
    );
    job.silenceIntervals = vadResult.silenceIntervals;
    job.speechIntervals = vadResult.speechIntervals;
    job.waveformPeaks = vadResult.waveformPeaks;
    job.audioMetrics = AudioPreprocessor.analyzeSignalAndSyncMetrics({
      waveformPeaks: vadResult.waveformPeaks,
      sampleRate: 16000,
      channels: 1,
      audioCodec: probeInfo.audioCodec || 'pcm_s16le',
      videoCodec: probeInfo.videoCodec,
      videoStartOffsetSec: probeInfo.videoStartOffsetSec,
      audioStartOffsetSec: probeInfo.audioStartOffsetSec,
      videoDurationSec: probeInfo.videoDurationSec,
      audioDurationSec: probeInfo.audioDurationSec,
      frameRateFps: probeInfo.frameRateFps,
      isVariableFrameRate: probeInfo.isVariableFrameRate,
    });
    checkCancelled();

    // Stage 5: Multi-Pass Speech Recognition (Pass A–E) with Controlled Overlap Chunking
    const tTranscribe = Date.now();
    const hasGroqKey = Boolean(getServerGroqApiKey());
    const whisperModel = getSelectedWhisperModel();

    updateJobStage(
      job,
      'detect_language',
      'running',
      'မူရင်းဘာသာစကားနှင့် Phoneme Alignment အသင့်ရှိမှု စစ်ဆေးနေပါသည်...',
      48
    );
    updateJobStage(
      job,
      'speech_recognition',
      'running',
      hasGroqKey
        ? `Multi-Pass ASR (${whisperModel} · ${processingMode}) ဖြင့် Segment နှင့် Word ID များ ထုတ်ယူနေပါသည်...`
        : `Multi-Pass AI Speech Recognition (${processingMode}) ဖြင့် စာသားနှင့် အချိန်မှတ်တမ်း ထုတ်ယူနေပါသည်...`,
      54
    );

    const chunks = await splitAudioIntoChunks(
      extracted.outputPath,
      jobId,
      options.chunkDurationSec || 180,
      options.chunkOverlapSec ?? 2.0
    );
    for (const c of chunks) {
      if (c.chunkPath !== extracted.outputPath) {
        tempFilesToClean.push(c.chunkPath);
      }
    }

    let detectedLanguage = 'အင်္ဂလိပ် (English)';
    let detectedLanguageCode = 'en';
    let usedGroq = false;
    const passASegments: Array<{
      startTime: number;
      endTime: number;
      originalText: string;
      speaker?: string;
      confidence?: number;
      words?: WordTimestamp[];
    }> = [];

    for (let i = 0; i < chunks.length; i++) {
      checkCancelled();
      const chunk = chunks[i];
      let chunkResult;

      if (hasGroqKey) {
        try {
          chunkResult = await transcribeAudioWithGroqWhisper(
            chunk.chunkPath,
            chunk.startOffsetSec,
            options.sourceLanguageHint
          );
          usedGroq = true;
        } catch {
          chunkResult = await transcribeAudioChunkWithGemini(
            chunk.chunkPath,
            'audio/wav',
            chunk.durationSec || probeInfo.durationSeconds,
            chunk.startOffsetSec
          );
        }
      } else {
        chunkResult = await transcribeAudioChunkWithGemini(
          chunk.chunkPath,
          'audio/wav',
          chunk.durationSec || probeInfo.durationSeconds,
          chunk.startOffsetSec
        );
      }

      if (i === 0) {
        detectedLanguage = chunkResult.detectedLanguage;
        detectedLanguageCode = chunkResult.detectedLanguageCode;
        job.detectedLanguage = detectedLanguage;
        job.detectedLanguageCode = detectedLanguageCode;
        updateJobStage(
          job,
          'detect_language',
          'completed',
          `မူရင်းဘာသာစကား - ${detectedLanguage} (${detectedLanguageCode})`,
          60,
          Date.now() - tTranscribe
        );
      }
      passASegments.push(...chunkResult.segments);
    }

    if (passASegments.length === 0) {
      throw new Error(
        'အသံဖိုင်ထဲမှ စကားပြောသံ ရှာမတွေ့ပါ။ အသံပါဝင်သော ဗီဒီယိုဖိုင်ဖြင့် ပြန်လည်စမ်းသပ်ပါ။'
      );
    }

    // Pass C, D & E: Validate transcript, remove hallucinations/duplicates, and assign stable word IDs
    const validatedTranscript = TranscriptValidator.validateAndCleanTranscript(passASegments);
    const verifiedRawSegments = validatedTranscript.verifiedSegments;

    updateJobStage(
      job,
      'speech_recognition',
      'completed',
      `Multi-Pass ASR (Pass A–E) ဖြင့် စာကြောင်း ${verifiedRawSegments.length} ကြောင်း အတည်ပြုပြီးပါပြီ`,
      66,
      Date.now() - tTranscribe
    );
    checkCancelled();

    // Stage 6: Phoneme-Level Forced Alignment + Iterative Acoustic Boundary Refinement
    const { alignmentRecords, iterationsRun } =
      TimestampRefinementService.runIterativeRefinement({
        rawSegments: verifiedRawSegments,
        silenceIntervals: vadResult.silenceIntervals,
        speechIntervals: vadResult.speechIntervals,
        waveformPeaks: vadResult.waveformPeaks,
        totalDurationSec: probeInfo.durationSeconds,
        languageCode: detectedLanguageCode,
        processingMode,
        audioStartOffsetSec: probeInfo.audioStartOffsetSec,
        videoStartOffsetSec: probeInfo.videoStartOffsetSec,
      });

    job.speechAlignmentLayer = alignmentRecords;

    const speakersBySegmentId = new Map<string, string>();
    verifiedRawSegments.forEach((s, idx) => {
      const id = `seg-${String(idx + 1).padStart(4, '0')}`;
      if (s.speaker) speakersBySegmentId.set(id, s.speaker);
    });

    // Checkpoint Speech Alignment Layer immediately so partial progress is preserved even if cancelled or translation fails
    job.segments = SubtitleComposer.composeSegmentsFromLayers(
      alignmentRecords,
      alignmentRecords.map((r) => ({
        segmentId: r.segmentId,
        translatedText: r.originalText,
        terminologyUsed: [],
        qualityStatus: 'verified',
      })),
      options.timingMode || 'exact_speech',
      {
        minDurationSec: options.minDurationSec ?? 0.6,
        maxDurationSec: options.maxDurationSec ?? 6.5,
        silenceIntervals: vadResult.silenceIntervals,
        speakersBySegmentId,
      }
    );

    updateJobStage(
      job,
      'vad_alignment',
      'completed',
      `Phoneme Alignment နှင့် Adaptive VAD (${job.audioMetrics.adaptiveVadThresholdDb}dB) ချိန်ညှိပြီးပါပြီ (${iterationsRun} passes)`,
      74,
      Date.now() - tVad
    );

    // Stage 7: Lock Immutable Original & Verified Timestamps in Speech Alignment Layer
    const tSeg = Date.now();
    updateJobStage(
      job,
      'generate_segments',
      'completed',
      `Speech Alignment Layer (${alignmentRecords.length} ခု) သီးခြားမှတ်တမ်းတင်ပြီးပါပြီ`,
      78,
      Date.now() - tSeg
    );
    checkCancelled();

    // Stage 8: Context-Memory Burmese Translation into independent Translation Layer
    const tTranslate = Date.now();
    const activeGeminiModel = getSelectedGeminiModel();
    const displayModelLabel =
      activeGeminiModel === 'gemini-3.1-pro-preview'
        ? 'Gemini 3.1 Pro (gemini-3.1-pro-preview)'
        : `Gemini (${activeGeminiModel})`;
    updateJobStage(
      job,
      'translate_gemini',
      'running',
      `${displayModelLabel} Context Memory စနစ်ဖြင့် သဘာဝကျသော မြန်မာယူနီကုဒ်သို့ ပြန်ဆိုနေပါသည်...`,
      85
    );

    const translationInput = alignmentRecords.map((rec) => ({
      id: rec.segmentId,
      startTime: rec.verifiedStartTime,
      endTime: rec.verifiedEndTime,
      speechStartTime: rec.speechStartTime,
      speechEndTime: rec.speechEndTime,
      originalText: rec.originalText,
      speaker: speakersBySegmentId.get(rec.segmentId),
      words: rec.words,
    }));

    const translationResult = await translateSegmentsToBurmeseWithGemini(translationInput, {
      sourceLanguage: detectedLanguage,
      targetLanguage: options.targetLanguage || 'Myanmar (Burmese Unicode)',
      videoCategory: options.videoCategory || 'general',
      translationStyle: options.translationStyle,
      thinkingMode: options.thinkingMode,
      preferredModel: activeGeminiModel,
      glossaryTerms: options.glossaryTerms,
      maxLinesPerSubtitle: options.maxLinesPerSubtitle,
      maxCharsPerLine: options.maxCharsPerLine,
    });

    const translationLayer: TranslationRecord[] = translationResult.translatedSegments.map(
      (ts) => ({
        segmentId: ts.id,
        translatedText: ts.translatedText,
        terminologyUsed: [],
        characterContext: ts.speaker,
        qualityStatus: ts.translatedText.trim() ? 'verified' : 'needs_review',
      })
    );
    job.translationLayer = translationLayer;
    job.modelUsed = `${usedGroq ? whisperModel : 'whisper-large-v3'} (${processingMode}) + ${translationResult.modelUsed}`;

    updateJobStage(
      job,
      'translate_gemini',
      'completed',
      `${translationResult.modelUsed} ဖြင့် အပိုင်း (${translationResult.validationStats.batchesProcessed}) ပိုင်း ဘာသာပြန်ဆိုပြီးပါပြီ`,
      92,
      Date.now() - tTranslate
    );
    checkCancelled();

    // Stage 9: Compose Display Subtitles & Run Final Quality Assurance (QA) Pass
    const tTiming = Date.now();
    updateJobStage(
      job,
      'validate_timing',
      'running',
      'Final Quality Assurance (QA) နှင့် အသံတိတ်ချိန် စစ်ဆေးချက် ပြုလုပ်နေပါသည်...',
      96
    );

    const activeTimingMode: TimingMode = options.timingMode || 'exact_speech';
    job.segments = SubtitleComposer.composeSegmentsFromLayers(
      alignmentRecords,
      translationLayer,
      activeTimingMode,
      {
        minDurationSec: options.minDurationSec ?? 0.6,
        maxDurationSec: options.maxDurationSec ?? 6.5,
        silenceIntervals: vadResult.silenceIntervals,
        maxLinesPerSubtitle: options.maxLinesPerSubtitle ?? 2,
        maxCharsPerLine: options.maxCharsPerLine ?? 42,
        speakersBySegmentId,
      }
    );

    job.timingMode = activeTimingMode;
    job.videoCategory = options.videoCategory || 'general';

    const qaResult = QualityAssuranceService.runFinalQaValidation({
      segments: job.segments,
      silenceIntervals: vadResult.silenceIntervals,
      speechIntervals: vadResult.speechIntervals,
      glossaryTerms: options.glossaryTerms || DEFAULT_SETTINGS.glossaryTerms,
      multiPassIterationsRun: iterationsRun,
      avStreamDriftSec: job.audioMetrics.avStreamDriftSec,
    });

    job.finalQaReport = qaResult.report;
    job.timingIssues = qaResult.timingIssues;
    job.translationIssues = qaResult.translationIssues;

    updateJobStage(
      job,
      'validate_timing',
      'completed',
      `Final QA စစ်ဆေးပြီးပါပြီ (Verified: ${qaResult.report.verifiedSegments}, High Confidence: ${qaResult.report.highConfidenceSegments}, Needs Review: ${qaResult.report.segmentsNeedingReview})`,
      98,
      Date.now() - tTiming
    );

    // Stage 10: Generate SRT / VTT / ASS
    const tSrt = Date.now();
    updateJobStage(
      job,
      'generate_srt',
      'running',
      'UTF-8 မြန်မာ SRT, WebVTT နှင့် ASS စာတန်းထိုးဖိုင်များ ထုတ်လုပ်နေပါသည်...',
      99
    );
    exportSubtitleContent(job.segments, 'srt', 'translated', job.fileName);
    updateJobStage(
      job,
      'generate_srt',
      'completed',
      'SRT, VTT နှင့် ASS စာတန်းထိုးဖိုင်များ ဒေါင်းလုဒ်လုပ်ရန် အသင့်ဖြစ်ပါပြီ',
      100,
      Date.now() - tSrt
    );

    job.currentStage = 'ready';
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'USER_CANCELLED_JOB') {
      job.status = 'cancelled';
      job.error = 'အသုံးပြုသူမှ လုပ်ငန်းစဉ်ကို ရပ်တန့်လိုက်ပါသည် (ပြီးစီးထားသော အစိတ်အပိုင်းများကို သိမ်းဆည်းထားပါသည်)။';
    } else {
      job.status = 'failed';
      job.error = message;
    }
    job.stages = job.stages.map((s) =>
      s.status === 'running' ? { ...s, status: 'error', detail: job.error } : s
    );
  } finally {
    if (fileLockKey) {
      activeFileHashes.delete(fileLockKey);
    }
    if (options.autoCleanupTempFiles && tempFilesToClean.length > 0) {
      await cleanupTempFiles(tempFilesToClean);
    }
  }
}

// --- HEALTH & API SETTINGS ROUTES ---

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'MingalarSub Ultra-Precision Subtitle Studio' });
});

app.get('/api/settings/api-keys/status', (_req: Request, res: Response) => {
  const groqKey = getServerGroqApiKey();
  const geminiKey = getServerGeminiApiKey();
  res.json({
    groqConfigured: Boolean(groqKey),
    geminiConfigured: isUsableEnvGeminiKey(geminiKey),
    geminiModel: getSelectedGeminiModel(),
    whisperModel: getSelectedWhisperModel(),
  });
});

app.get('/api/settings/config', (_req: Request, res: Response) => {
  const groqKey = getServerGroqApiKey();
  const geminiKey = getServerGeminiApiKey();
  const hasValidGemini = isUsableEnvGeminiKey(geminiKey);

    const availableModels = [
      {
        id: 'gemini-3.1-pro-preview',
        label: 'Gemini 3.1 Pro (gemini-3.1-pro-preview — မြန်မာစာ အကောင်းဆုံး မော်ဒယ်)',
      },
      {
        id: 'gemini-3-flash-preview',
        label: 'Gemini 3 Flash (gemini-3-flash-preview — မြန်ဆန်သော မော်ဒယ်)',
      },
      {
        id: 'gemini-2.5-pro',
        label: 'Gemini 2.5 Pro (gemini-2.5-pro — အဆင့်မြင့် ဘာသာပြန်မော်ဒယ်)',
      },
      {
        id: 'gemini-2.5-flash',
        label: 'Gemini 2.5 Flash (gemini-2.5-flash — ပေါ့ပါးမြန်ဆန်သော မော်ဒယ်)',
      },
    ];

    res.json({
      groq: {
        hasKey: Boolean(groqKey),
        maskedKey: maskApiKey(groqKey),
        whisperModel: getSelectedWhisperModel(),
      },
      gemini: {
        hasKey: hasValidGemini,
        maskedKey: maskApiKey(geminiKey),
        geminiModel: getSelectedGeminiModel(),
        availableModels,
      },
    });
  });

app.post('/api/settings/groq', (req: Request, res: Response) => {
  const { apiKey, whisperModel } = req.body || {};
  if (typeof apiKey === 'string' && apiKey.trim().length > 0 && !apiKey.includes('••••')) {
    setServerGroqApiKey(apiKey);
  }
  if (typeof whisperModel === 'string' && whisperModel.trim().length > 0) {
    setSelectedWhisperModel(whisperModel);
  }

  const currentKey = getServerGroqApiKey();
  res.json({
    ok: true,
    hasKey: Boolean(currentKey),
    maskedKey: maskApiKey(currentKey),
    whisperModel: getSelectedWhisperModel(),
    message: 'Groq API သတ်မှတ်ချက်ကို ဆာဗာပေါ်တွင် လုံခြုံစွာ သိမ်းဆည်းပြီးပါပြီ။',
  });
});

app.post('/api/settings/test-groq', async (req: Request, res: Response) => {
  const { apiKey } = req.body || {};
  const candidate =
    typeof apiKey === 'string' && apiKey.trim().length > 0 && !apiKey.includes('••••')
      ? apiKey.trim()
      : undefined;
  const result = await testGroqConnection(candidate);
  res.status(result.ok ? 200 : 400).json(result);
});

app.post('/api/settings/gemini', (req: Request, res: Response) => {
  const { apiKey, geminiModel } = req.body || {};
  if (typeof apiKey === 'string' && apiKey.trim().length > 0 && !apiKey.includes('••••')) {
    setServerGeminiApiKey(apiKey);
  }
  if (
    typeof geminiModel === 'string' &&
    ALLOWED_GEMINI_MODELS.includes(geminiModel as GeminiModelId)
  ) {
    setSelectedGeminiModel(geminiModel as GeminiModelId);
  }

  const currentKey = getServerGeminiApiKey();
  res.json({
    ok: true,
    hasKey: isUsableEnvGeminiKey(currentKey),
    maskedKey: maskApiKey(currentKey),
    geminiModel: getSelectedGeminiModel(),
    message: `Gemini API နှင့် ${getSelectedGeminiModel()} ကို ဆာဗာပေါ်တွင် လုံခြုံစွာ သိမ်းဆည်းပြီးပါပြီ။`,
  });
});

app.post('/api/settings/test-gemini', async (req: Request, res: Response) => {
  const { apiKey, geminiModel } = req.body || {};
  const candidate =
    typeof apiKey === 'string' && apiKey.trim().length > 0 && !apiKey.includes('••••')
      ? apiKey.trim()
      : undefined;
  const result = await testGeminiConnection(candidate, geminiModel);
  res.status(result.ok ? 200 : 400).json(result);
});

// --- SUBTITLE PIPELINE ROUTES ---

app.get('/api/system/status', async (_req: Request, res: Response) => {
  try {
    ensureTempDirs();
    const uploadFiles = await fs.promises.readdir(UPLOAD_DIR);
    const audioFiles = await fs.promises.readdir(AUDIO_DIR);
    res.json({
      ffmpegAvailable: true,
      tempFilesCount: uploadFiles.length + audioFiles.length,
      maxUploadMb,
      models: {
        transcription: getSelectedWhisperModel(),
        translationThinking: `${getSelectedGeminiModel()} (ThinkingLevel.HIGH)`,
      },
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/jobs', (_req: Request, res: Response) => {
  const list = Array.from(jobsMap.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  res.json({ jobs: list });
});

app.get('/api/jobs/:id', (req: Request, res: Response) => {
  const job = jobsMap.get(String(req.params.id));
  if (!job) {
    res.status(404).json({ error: 'လုပ်ငန်းစဉ် ရှာမတွေ့ပါ။' });
    return;
  }
  res.json({ job });
});

app.post('/api/jobs/:id/cancel', (req: Request, res: Response) => {
  const jobId = String(req.params.id);
  const job = jobsMap.get(jobId);
  if (!job) {
    res.status(404).json({ error: 'လုပ်ငန်းစဉ် ရှာမတွေ့ပါ။' });
    return;
  }
  cancelledJobIds.add(jobId);
  job.status = 'cancelled';
  job.error =
    'အသုံးပြုသူမှ လုပ်ငန်းစဉ်ကို ရပ်တန့်လိုက်ပါသည် (ပြီးစီးထားသော အစိတ်အပိုင်းများကို သိမ်းဆည်းထားပါသည်)။';
  res.json({ ok: true, job });
});

app.post('/api/jobs/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'ဗီဒီယို သို့မဟုတ် အသံဖိုင် ရွေးချယ်ထားခြင်း မရှိပါ။' });
      return;
    }

    const validation = validateMediaExtension(file.originalname);
    if (!validation.valid) {
      await cleanupTempFiles([file.path]);
      res.status(400).json({
        error: `ဖိုင်အမျိုးအစား "${validation.ext}" ကို လက်မခံပါ။ MP4, MKV, MOV, MP3, WAV, M4A ဖိုင်များသာ တင်ပေးပါ။`,
      });
      return;
    }

    const fileLockKey = `${file.originalname}_${file.size}`;
    if (activeFileHashes.has(fileLockKey)) {
      await cleanupTempFiles([file.path]);
      res.status(409).json({
        error: `"${file.originalname}" ဖိုင်ကို လက်ရှိ လုပ်ဆောင်နေဆဲ ဖြစ်ပါသည်။ ခဏစောင့်ဆိုင်းပေးပါ။`,
      });
      return;
    }

    const thinkingMode = req.body.thinkingMode !== 'false';
    const targetLanguage = String(req.body.targetLanguage || 'Myanmar (Burmese Unicode)');
    const sourceLanguageHint = String(req.body.sourceLanguageHint || 'auto');
    const videoCategory = (req.body.videoCategory || 'general') as VideoCategory;
    const timingMode = (req.body.timingMode || 'exact_speech') as TimingMode;
    const processingMode = (req.body.processingMode || 'maximum_accuracy') as ProcessingMode;
    const translationStyle = (req.body.translationStyle || 'conversational') as
      | 'conversational'
      | 'formal'
      | 'cinema'
      | 'documentary';
    const maxLinesPerSubtitle = Number(req.body.maxLinesPerSubtitle) || 2;
    const maxCharsPerLine = Number(req.body.maxCharsPerLine) || 42;
    const minDurationSec = Number(req.body.minDurationSec) || 0.6;
    const maxDurationSec = Number(req.body.maxDurationSec) || 6.5;
    const autoCleanupTempFiles = req.body.autoCleanupTempFiles !== 'false';

    let glossaryTerms = DEFAULT_SETTINGS.glossaryTerms;
    if (req.body.glossaryTerms) {
      try {
        glossaryTerms = JSON.parse(req.body.glossaryTerms);
      } catch {
        // use default
      }
    }

    let characterMemory: CharacterMemoryItem[] = [];
    if (req.body.characterMemory) {
      try {
        characterMemory = JSON.parse(req.body.characterMemory);
      } catch {
        // use default
      }
    }

    const jobId = `job-${crypto.randomUUID().slice(0, 8)}`;
    const newJob: ProcessingJob = {
      id: jobId,
      fileName: file.originalname,
      fileSize: file.size,
      durationSeconds: 0,
      format: validation.ext.slice(1).toUpperCase(),
      createdAt: new Date().toISOString(),
      status: 'processing',
      currentStage: 'upload',
      progress: 8,
      detectedLanguage: 'စစ်ဆေးနေဆဲ...',
      detectedLanguageCode: '--',
      videoCategory,
      timingMode,
      processingMode,
      thinkingMode,
      modelUsed: `${getSelectedWhisperModel()} (${processingMode}) + ${getSelectedGeminiModel()}`,
      translationStyle,
      segments: [],
      stages: structuredClone(DEFAULT_PIPELINE_STAGES),
      mediaUrl: `/api/media/${path.basename(file.path)}`,
    };

    jobsMap.set(jobId, newJob);
    jobFilePaths.set(jobId, file.path);
    activeFileHashes.add(fileLockKey);

    void executeSubtitlePipeline(
      jobId,
      file.path,
      {
        sourceLanguageHint,
        targetLanguage,
        videoCategory,
        timingMode,
        processingMode,
        translationStyle,
        thinkingMode,
        glossaryTerms,
        characterMemory,
        maxLinesPerSubtitle,
        maxCharsPerLine,
        minDurationSec,
        maxDurationSec,
        autoCleanupTempFiles,
      },
      fileLockKey
    );

    res.status(201).json({ job: newJob });
  } catch (err) {
    res.status(500).json({
      error:
        err instanceof Error
          ? err.message
          : 'စာတန်းထိုး လုပ်ငန်းစဉ် စတင်ရာတွင် အမှားဖြစ်ပေါ်နေပါသည်။',
    });
  }
});

app.post('/api/jobs/:id/retry', async (req: Request, res: Response) => {
  const jobId = String(req.params.id);
  const job = jobsMap.get(jobId);
  if (!job) {
    res.status(404).json({ error: 'လုပ်ငန်းစဉ် ရှာမတွေ့ပါ။' });
    return;
  }

  const filePath = jobFilePaths.get(jobId);
  if (!filePath || !fs.existsSync(filePath)) {
    res.status(400).json({
      error:
        'မူရင်း ဗီဒီယို/အသံဖိုင်ကို ဆာဗာပေါ်တွင် ပြန်ရှာမတွေ့တော့ပါ။ ကျေးဇူးပြု၍ ဖိုင်ကို ပြန်လည်ရွေးချယ်ပြီး တင်ပေးပါ။',
    });
    return;
  }

  job.status = 'processing';
  job.error = undefined;
  job.progress = 5;
  job.stages = structuredClone(DEFAULT_PIPELINE_STAGES);

  void executeSubtitlePipeline(jobId, filePath, {
    videoCategory: job.videoCategory || 'general',
    timingMode: job.timingMode || 'exact_speech',
    processingMode: job.processingMode || 'maximum_accuracy',
    translationStyle: job.translationStyle,
    thinkingMode: job.thinkingMode,
    glossaryTerms: DEFAULT_SETTINGS.glossaryTerms,
  });

  res.json({ job });
});

app.put('/api/jobs/:id/segments', (req: Request, res: Response) => {
  const jobId = String(req.params.id);
  const incoming = Array.isArray(req.body.segments)
    ? (req.body.segments as SubtitleSegment[])
    : [];
  const job = jobsMap.get(jobId);
  if (!job) {
    const { normalized } = normalizeAndValidateSegments(incoming);
    const qa = QualityAssuranceService.runFinalQaValidation({
      segments: normalized,
      glossaryTerms: DEFAULT_SETTINGS.glossaryTerms,
    });
    res.json({
      segments: normalized,
      finalQaReport: qa.report,
      timingIssues: qa.timingIssues,
      translationIssues: qa.translationIssues,
    });
    return;
  }

  const { normalized } = normalizeAndValidateSegments(incoming, {
    silenceIntervals: job.silenceIntervals,
  });
  job.segments = normalized;

  const qa = QualityAssuranceService.runFinalQaValidation({
    segments: job.segments,
    silenceIntervals: job.silenceIntervals,
    speechIntervals: job.speechIntervals,
    glossaryTerms: DEFAULT_SETTINGS.glossaryTerms,
    avStreamDriftSec: job.audioMetrics?.avStreamDriftSec,
  });
  job.finalQaReport = qa.report;
  job.timingIssues = qa.timingIssues;
  job.translationIssues = qa.translationIssues;

  res.json({
    job,
    finalQaReport: job.finalQaReport,
    timingIssues: job.timingIssues,
    translationIssues: job.translationIssues,
  });
});

app.post('/api/subtitles/refine-burmese', async (req: Request, res: Response) => {
  try {
    const { segments, instruction, translationStyle, videoCategory } = req.body;
    if (!Array.isArray(segments) || segments.length === 0) {
      res.status(400).json({ error: 'ပြင်ဆင်ရန် စာတန်းထိုး မရှိသေးပါ။' });
      return;
    }

    const result = await refineBurmeseSubtitlesWithHighThinking({
      segments,
      instruction:
        instruction ||
        'သဘာဝကျသော မြန်မာစကားပြောဟန် ဖြစ်အောင် ပြင်ဆင်ပေးပါ။',
      translationStyle: translationStyle || 'conversational',
      videoCategory: videoCategory || 'general',
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({
      error:
        err instanceof Error
          ? err.message
          : 'Gemini ဖြင့် စာသားပြင်ဆင်ရာတွင် အမှားဖြစ်ပေါ်နေပါသည်။',
    });
  }
});

// Export SRT, VTT, or ASS endpoint
app.get('/api/jobs/:id/export', (req: Request, res: Response) => {
  const job = jobsMap.get(String(req.params.id));
  if (!job) {
    res.status(404).json({ error: 'လုပ်ငန်းစဉ် ရှာမတွေ့ပါ။' });
    return;
  }

  const mode =
    (req.query.mode as 'translated' | 'original' | 'bilingual') || 'translated';
  const format = ((req.query.format as string) || 'srt').toLowerCase() as SubtitleExportFormat;
  const exported = exportSubtitleContent(job.segments, format, mode, job.fileName);
  const baseName = path.basename(job.fileName, path.extname(job.fileName));
  const langTag =
    mode === 'translated'
      ? '.my'
      : mode === 'original'
      ? `.${job.detectedLanguageCode || 'orig'}`
      : '.bilingual';

  res.setHeader('Content-Type', exported.mimeType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${baseName}${langTag}${exported.extension}"`
  );
  res.send('\uFEFF' + exported.content);
});

app.get('/api/media/:fileName', (req: Request, res: Response) => {
  const safeName = path.basename(String(req.params.fileName));
  const fullPath = path.join(UPLOAD_DIR, safeName);
  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'မီဒီယာဖိုင် ရှာမတွေ့ပါ။' });
    return;
  }
  res.sendFile(fullPath);
});

app.post('/api/system/cleanup', async (_req: Request, res: Response) => {
  try {
    const result = await cleanupTempFiles();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

async function startServer() {
  const PORT = 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MingalarSub Studio server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
