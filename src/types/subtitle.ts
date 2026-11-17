export type PipelineStageId =
  | 'upload'
  | 'validate_file'
  | 'extract_audio'
  | 'detect_language'
  | 'speech_recognition'
  | 'vad_alignment'
  | 'generate_segments'
  | 'translate_gemini'
  | 'validate_timing'
  | 'generate_srt'
  | 'ready';

export type StageStatus = 'pending' | 'running' | 'completed' | 'error';

export type VideoCategory =
  | 'anime'
  | 'movies'
  | 'drama'
  | 'series'
  | 'documentary'
  | 'educational'
  | 'youtube'
  | 'interview'
  | 'general';

export type TimingMode = 'exact_speech' | 'readability' | 'manual';

export type ProcessingMode = 'fast' | 'balanced' | 'maximum_accuracy';

export type SubtitleExportFormat = 'srt' | 'vtt' | 'ass';

export type VerificationLabel =
  | 'verified'
  | 'high_confidence'
  | 'needs_review'
  | 'unresolved';

export type AlignmentSource =
  | 'phoneme_forced_align'
  | 'acoustic_energy_refined'
  | 'multilingual_prosody_refined'
  | 'asr_word_boundary'
  | 'manual_override';

export interface TimestampCorrectionEntry {
  timestamp: string;
  stage:
    | 'pass_a_asr'
    | 'pass_b_retranscribe'
    | 'phoneme_alignment'
    | 'vad_reconciliation'
    | 'acoustic_refinement'
    | 'av_sync_offset'
    | 'qc_approved'
    | 'user_manual';
  previousStart: number;
  previousEnd: number;
  newStart: number;
  newEnd: number;
  reason: string;
}

export interface PipelineStageInfo {
  id: PipelineStageId;
  label: string;
  description: string;
  status: StageStatus;
  detail?: string;
  durationMs?: number;
}

export interface WordTimestamp {
  id?: string;
  word: string;
  start: number;
  end: number;
  originalStart?: number;
  originalEnd?: number;
  verifiedStart?: number;
  verifiedEnd?: number;
  phonemes?: string[];
  confidence?: number;
  vadAgreement?: boolean;
  acousticVerified?: boolean;
  alignmentSource?: AlignmentSource;
  verificationLabel?: VerificationLabel;
}

export interface SpeechInterval {
  start: number;
  end: number;
  speechProbability?: number;
  isQuietSpeech?: boolean;
}

export interface SilenceInterval {
  start: number;
  end: number;
  duration: number;
  kind?: 'breathing_pause' | 'short_pause' | 'long_silence' | 'background_non_speech';
}

export interface AudioAnalysisMetrics {
  sampleRate: number;
  channels: number;
  audioCodec: string;
  videoCodec?: string;
  loudnessLufs: number;
  peakDb: number;
  clippingDetected: boolean;
  noiseFloorDb: number;
  snrDb: number;
  adaptiveVadThresholdDb: number;
  videoStartOffsetSec: number;
  audioStartOffsetSec: number;
  avStreamDriftSec: number;
  frameRateFps: number;
  isVariableFrameRate: boolean;
  integrityValid: boolean;
}

export interface SpeechAlignmentRecord {
  segmentId: string;
  originalText: string;
  originalStartTime: number;
  originalEndTime: number;
  verifiedStartTime: number;
  verifiedEndTime: number;
  speechStartTime: number;
  speechEndTime: number;
  words: WordTimestamp[];
  confidence: number;
  vadAgreement: boolean;
  acousticVerificationStatus: 'verified' | 'partial' | 'uncertain';
  alignmentSource: AlignmentSource;
  verificationLabel: VerificationLabel;
  languageSupportMode: 'native_phoneme_dictionary' | 'multilingual_acoustic_fallback';
  disagreementMs?: number;
  correctionHistory: TimestampCorrectionEntry[];
  reviewStatus: 'pending' | 'approved' | 'manual_edited';
}

export interface TranslationRecord {
  segmentId: string;
  translatedText: string;
  terminologyUsed: string[];
  characterContext?: string;
  qualityStatus: 'verified' | 'needs_review';
}

export interface SubtitleSegment {
  id: string;
  index: number;
  startTime: number; // active display start time in seconds
  endTime: number; // active display end time in seconds
  originalStartTime?: number; // immutable raw ASR start time
  originalEndTime?: number; // immutable raw ASR end time
  verifiedStartTime?: number; // proposed forced-aligned / acoustic-verified start time
  verifiedEndTime?: number; // proposed forced-aligned / acoustic-verified end time
  speechStartTime?: number; // detected actual speech onset boundary
  speechEndTime?: number; // detected actual speech offset boundary
  originalText: string;
  translatedText: string; // Burmese Unicode
  speaker?: string;
  confidence?: number;
  vadAgreement?: boolean;
  acousticVerificationStatus?: 'verified' | 'partial' | 'uncertain';
  alignmentSource?: AlignmentSource;
  verificationLabel?: VerificationLabel;
  languageSupportMode?: 'native_phoneme_dictionary' | 'multilingual_acoustic_fallback';
  disagreementMs?: number;
  correctionHistory?: TimestampCorrectionEntry[];
  reviewStatus?: 'pending' | 'approved' | 'manual_edited';
  words?: WordTimestamp[];
  notes?: string;
}

export interface TimingIssue {
  id: string;
  segmentId: string;
  segmentIndex: number;
  type:
    | 'negative_time'
    | 'invalid_order'
    | 'overlap'
    | 'silence_bleed'
    | 'unexplained_gap'
    | 'too_short'
    | 'too_long'
    | 'too_long_lines'
    | 'high_cps'
    | 'invalid_duration'
    | 'chronology'
    | 'speech_before_subtitle'
    | 'speech_continues_past_subtitle'
    | 'alignment_disagreement';
  severity: 'error' | 'warning';
  message: string;
  suggestedStartTime?: number;
  suggestedEndTime?: number;
}

export interface TranslationIssue {
  id: string;
  segmentId: string;
  segmentIndex: number;
  type:
    | 'missing_translation'
    | 'untranslated_source'
    | 'inconsistent_glossary'
    | 'excessive_length'
    | 'repeated_words'
    | 'zawgyi_detected';
  severity: 'error' | 'warning';
  message: string;
  suggestedText?: string;
}

export interface FinalQaReport {
  totalSegments: number;
  totalWords: number;
  verifiedSegments: number;
  highConfidenceSegments: number;
  segmentsNeedingReview: number;
  unresolvedTimingIssues: number;
  omittedSpeechCount: number;
  overlapCount: number;
  silenceBleedCount: number;
  detectedSilenceViolations: number;
  avSyncPreserved: boolean;
  burmeseTranslationComplete: boolean;
  exportValidationPassed: boolean;
  multiPassIterationsRun: number;
  warnings: string[];
  generatedAt: string;
}

export interface BenchmarkEvaluationMetrics {
  sampleCount: number;
  wordBoundaryMaeMs: number;
  medianBoundaryErrorMs: number;
  p90BoundaryErrorMs: number;
  p95BoundaryErrorMs: number;
  within50msPct: number;
  within100msPct: number;
  within200msPct: number;
  speechOmissionRate: number;
  falseSpeechDetectionRate: number;
  subtitleOverlapRate: number;
  silenceViolationRate: number;
}

export interface MediaMetadata {
  fileName: string;
  fileSize: number;
  mimeType: string;
  durationSeconds: number;
  format: string;
  sampleRate?: number;
  channels?: number;
}

export interface ProcessingJob {
  id: string;
  fileName: string;
  fileSize: number;
  durationSeconds: number;
  format: string;
  createdAt: string;
  completedAt?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  currentStage: PipelineStageId;
  progress: number; // 0 to 100
  detectedLanguage: string;
  detectedLanguageCode: string;
  videoCategory?: VideoCategory;
  timingMode?: TimingMode;
  processingMode?: ProcessingMode;
  thinkingMode: boolean;
  modelUsed: string;
  translationStyle: 'conversational' | 'formal' | 'cinema' | 'documentary';
  segments: SubtitleSegment[];
  speechAlignmentLayer?: SpeechAlignmentRecord[];
  translationLayer?: TranslationRecord[];
  stages: PipelineStageInfo[];
  speechIntervals?: SpeechInterval[];
  silenceIntervals?: SilenceInterval[];
  waveformPeaks?: number[]; // normalized 0..1 amplitude samples across duration
  audioMetrics?: AudioAnalysisMetrics;
  finalQaReport?: FinalQaReport;
  timingIssues?: TimingIssue[];
  translationIssues?: TranslationIssue[];
  error?: string;
  audioUrl?: string;
  mediaUrl?: string;
  isDemo?: boolean;
}

export type GeminiModelId =
  | 'gemini-3.1-pro-preview'
  | 'gemini-3-flash-preview'
  | 'gemini-2.5-pro'
  | 'gemini-2.5-flash';

export interface SubtitleStyleSettings {
  fontSize: 'sm' | 'md' | 'lg';
  textColor: '#FEF3C7' | '#FFFFFF' | '#A7F3D0' | '#BAE6FD';
  bgOpacity: number; // 0 to 90
  outlineStyle: 'drop_shadow' | 'box' | 'outline';
}

export interface CharacterMemoryItem {
  name: string;
  burmeseName: string;
  relationship?: string;
  notes?: string;
}

export interface AppSettings {
  thinkingMode: boolean;
  modelName: GeminiModelId;
  transcriptionEngine: 'whisper-hybrid';
  videoCategory: VideoCategory;
  timingMode: TimingMode;
  processingMode: ProcessingMode;
  translationStyle: 'conversational' | 'formal' | 'cinema' | 'documentary';
  maxLinesPerSubtitle: number;
  maxCharsPerLine: number;
  maxCps: number;
  minDurationSec: number;
  maxDurationSec: number;
  maxUploadSizeMb: number;
  chunkDurationSec: number;
  chunkOverlapSec: number;
  autoCleanupTempFiles: boolean;
  preserveCharacterNames: boolean;
  glossaryTerms: Array<{ source: string; burmese: string }>;
  characterMemory: CharacterMemoryItem[];
  subtitleStyle: SubtitleStyleSettings;
}

