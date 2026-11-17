/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Settings,
  Upload,
  FileVideo,
  FileAudio,
  Play,
  Pause,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RotateCcw,
  Plus,
  Trash2,
  Scissors,
  Merge,
  Search,
  Replace,
  Copy,
  Check,
  SkipBack,
  Sparkles,
  FileText,
  ArrowRight,
  Activity,
  ShieldAlert,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  History,
  XCircle,
  BookOpen,
  Palette,
  User,
  Gauge,
} from 'lucide-react';
import {
  AppSettings,
  GeminiModelId,
  ProcessingJob,
  ProcessingMode,
  SubtitleExportFormat,
  SubtitleSegment,
  SubtitleStyleSettings,
  TimingIssue,
  TimingMode,
  TranslationIssue,
  VerificationLabel,
  VideoCategory,
} from './types/subtitle';
import {
  DEFAULT_PIPELINE_STAGES,
  DEFAULT_SETTINGS,
} from './utils/demoData';
import {
  applyTimingModeToSegments,
  exportSubtitleContent,
  formatSrtTimestamp,
  parseSrtTimestamp,
  formatDisplayTimecode,
  parseSrtContent,
  searchAndReplaceSegments,
  splitSubtitleSegment,
  mergeSubtitleSegments,
} from './utils/subtitleUtils';
import {
  QualityAssuranceService,
  SubtitleComposer,
} from './services/subtitlePipelineServices';
import { ApiSettingsPage } from './components/ApiSettingsPage';

type ViewMode = 'home' | 'api_settings';

const ALLOWED_EXTS = ['.mp4', '.mkv', '.mov', '.mp3', '.wav', '.m4a', '.webm'];
const VALID_GEMINI_MODELS: GeminiModelId[] = [
  'gemini-3.1-pro-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
];
const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function sanitizeGeminiModel(model?: string): GeminiModelId {
  if (model && VALID_GEMINI_MODELS.includes(model as GeminiModelId)) {
    return model as GeminiModelId;
  }
  return 'gemini-3.1-pro-preview';
}

function renderVerificationBadge(label?: VerificationLabel) {
  switch (label) {
    case 'verified':
      return {
        text: 'Verified (အတည်ပြုပြီး)',
        cls: 'text-emerald-300 border-emerald-700/60 bg-emerald-950/40',
      };
    case 'high_confidence':
      return {
        text: 'High Confidence (ယုံကြည်မှုမြင့်)',
        cls: 'text-sky-300 border-sky-700/60 bg-sky-950/40',
      };
    case 'needs_review':
      return {
        text: 'Needs Review (စစ်ဆေးရန်လိုအပ်)',
        cls: 'text-amber-300 border-amber-600/60 bg-amber-950/40',
      };
    case 'unresolved':
      return {
        text: 'Unresolved (ဖြေရှင်းရန်လိုအပ်)',
        cls: 'text-rose-300 border-rose-700/60 bg-rose-950/40',
      };
    default:
      return {
        text: 'Verified (အတည်ပြုပြီး)',
        cls: 'text-emerald-300 border-emerald-700/60 bg-emerald-950/40',
      };
  }
}

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('home');
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');

  // Settings persisted in localStorage (v7 enforces valid Gemini models & Maximum Accuracy default)
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved =
        localStorage.getItem('mingalarsub_settings_v7') ||
        localStorage.getItem('mingalarsub_settings_v6');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          modelName: sanitizeGeminiModel(parsed.modelName),
          timingMode: parsed.timingMode || 'exact_speech',
          processingMode: parsed.processingMode || 'maximum_accuracy',
          videoCategory: parsed.videoCategory || 'general',
          thinkingMode: true,
          characterMemory: Array.isArray(parsed.characterMemory)
            ? parsed.characterMemory
            : DEFAULT_SETTINGS.characterMemory,
          glossaryTerms: Array.isArray(parsed.glossaryTerms)
            ? parsed.glossaryTerms
            : DEFAULT_SETTINGS.glossaryTerms,
          subtitleStyle: {
            ...DEFAULT_SETTINGS.subtitleStyle,
            ...(parsed.subtitleStyle || {}),
          },
        };
      }
      return DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // Upload & Pipeline State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileObjectUrl, setSelectedFileObjectUrl] = useState<string | null>(null);
  const [probedDuration, setProbedDuration] = useState<number | null>(null);
  const [sourceLangChoice, setSourceLangChoice] = useState<string>('auto');
  const [targetLangChoice, setTargetLangChoice] = useState<string>('Myanmar (Burmese Unicode)');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Character & Glossary Memory State
  const [showMemoryPanel, setShowMemoryPanel] = useState<boolean>(false);
  const [newCharName, setNewCharName] = useState<string>('');
  const [newCharBurmese, setNewCharBurmese] = useState<string>('');
  const [newCharRelation, setNewCharRelation] = useState<string>('');
  const [newGlossarySource, setNewGlossarySource] = useState<string>('');
  const [newGlossaryBurmese, setNewGlossaryBurmese] = useState<string>('');

  // Subtitle Preview, Zoomable Waveform, Word-Level Timeline & Editor State
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [waveformZoom, setWaveformZoom] = useState<number>(1);
  const [timelineGranularity, setTimelineGranularity] = useState<'segment' | 'word'>('segment');
  const [showOriginalOverlay, setShowOriginalOverlay] = useState<boolean>(true);
  const [showSearchTools, setShowSearchTools] = useState<boolean>(false);
  const [showQcPanel, setShowQcPanel] = useState<boolean>(false);
  const [showStylePanel, setShowStylePanel] = useState<boolean>(false);
  const [expandedHistorySegId, setExpandedHistorySegId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [replaceText, setReplaceText] = useState<string>('');
  const [replaceFeedback, setReplaceFeedback] = useState<string | null>(null);
  const [isRefining, setIsRefining] = useState<boolean>(false);
  const [refineFeedback, setRefineFeedback] = useState<string | null>(null);
  const [copiedSrt, setCopiedSrt] = useState<boolean>(false);
  const [timeDrafts, setTimeDrafts] = useState<Record<string, string>>({});

  // Undo / Redo Stacks per Job ID
  const [undoStacks, setUndoStacks] = useState<Record<string, SubtitleSegment[][]>>({});
  const [redoStacks, setRedoStacks] = useState<Record<string, SubtitleSegment[][]>>({});

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const srtInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handleUpdateSettings = useCallback((partial: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next: AppSettings = {
        ...prev,
        ...partial,
        modelName: sanitizeGeminiModel(partial.modelName ?? prev.modelName),
      };
      try {
        localStorage.setItem('mingalarsub_settings_v7', JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const handleUpdateSubtitleStyle = useCallback(
    (partial: Partial<SubtitleStyleSettings>) => {
      handleUpdateSettings({
        subtitleStyle: {
          ...settings.subtitleStyle,
          ...partial,
        },
      });
    },
    [handleUpdateSettings, settings.subtitleStyle]
  );

  // Load jobs from backend on mount
  useEffect(() => {
    let mounted = true;
    fetch('/api/jobs')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (mounted && data && Array.isArray(data.jobs)) {
          setJobs(data.jobs);
          if (data.jobs.length > 0) {
            setSelectedJobId(data.jobs[0].id);
          }
        }
      })
      .catch(() => {
        // ignore network error
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Poll backend when any job is in 'processing' status
  useEffect(() => {
    const processingJobs = jobs.filter((j) => j.status === 'processing');
    if (processingJobs.length === 0) return;

    const timer = window.setInterval(async () => {
      try {
        const res = await fetch('/api/jobs');
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.jobs)) {
          setJobs(data.jobs);
        }
      } catch {
        // ignore transient error
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [jobs]);

  const activeJob: ProcessingJob | null = useMemo(() => {
    if (jobs.length === 0) return null;
    return jobs.find((j) => j.id === selectedJobId) || jobs[0] || null;
  }, [jobs, selectedJobId]);

  const duration = useMemo(() => {
    if (!activeJob) return 15;
    return Math.max(
      activeJob.durationSeconds || 15,
      activeJob.segments.reduce((m, s) => Math.max(m, s.endTime), 10)
    );
  }, [activeJob]);

  const frameStepSec = useMemo(() => {
    const fps = activeJob?.audioMetrics?.frameRateFps || 24;
    return Number((1 / Math.max(1, fps)).toFixed(4));
  }, [activeJob?.audioMetrics?.frameRateFps]);

  // Reset playhead when switching active job
  useEffect(() => {
    setIsPlaying(false);
    if (!activeJob) {
      setCurrentTime(0);
      return;
    }
    const firstStart = activeJob.segments[0]
      ? Number((activeJob.segments[0].startTime + 0.05).toFixed(2))
      : 0;
    setCurrentTime(firstStart);
    setTimeDrafts({});
    setReplaceFeedback(null);
    setRefineFeedback(null);
  }, [activeJob?.id]);

  // Sync playbackRate with HTMLVideoElement
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, activeJob?.mediaUrl]);

  // High-precision 33ms (~30fps) synchronized playback loop for exact speech onset/offset subtitle switching
  useEffect(() => {
    if (!isPlaying || !activeJob) return;

    if (activeJob.mediaUrl && videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
      videoRef.current.play().catch(() => {});
    }

    const interval = window.setInterval(() => {
      if (activeJob.mediaUrl && videoRef.current && !videoRef.current.paused) {
        setCurrentTime(videoRef.current.currentTime);
        if (videoRef.current.ended) {
          setIsPlaying(false);
        }
      } else {
        const step = 0.033 * playbackRate;
        setCurrentTime((prev) => {
          if (prev + step >= duration) {
            setIsPlaying(false);
            return 0;
          }
          return Number((prev + step).toFixed(3));
        });
      }
    }, 33);

    return () => window.clearInterval(interval);
  }, [isPlaying, duration, activeJob, playbackRate]);

  // Strict Speech-Only Subtitle Synchronization Law:
  // NO SPEECH = NO SUBTITLE
  // SPEECH STARTS = SUBTITLE APPEARS
  // SPEECH ENDS = SUBTITLE DISAPPEARS
  const isCurrentlyInSilence = useMemo(() => {
    if (!activeJob) return true;
    if (activeJob.silenceIntervals && activeJob.silenceIntervals.length > 0) {
      const inVadSilence = activeJob.silenceIntervals.some(
        (sil) =>
          sil.duration >= 0.25 &&
          currentTime >= sil.start + 0.005 &&
          currentTime <= sil.end - 0.005
      );
      if (inVadSilence) return true;
    }
    const inAnySegment = activeJob.segments.some((s) => {
      const spStart = s.speechStartTime ?? s.startTime;
      const spEnd = s.speechEndTime ?? s.endTime;
      return (
        currentTime >= Math.max(s.startTime, spStart) &&
        currentTime <= Math.min(s.endTime, spEnd)
      );
    });
    return !inAnySegment;
  }, [activeJob, currentTime]);

  const activeSegment = useMemo(() => {
    if (!activeJob || isCurrentlyInSilence) {
      return null;
    }

    const candidate =
      activeJob.segments.find((s) => {
        const spStart = s.speechStartTime ?? s.startTime;
        const spEnd = s.speechEndTime ?? s.endTime;
        return (
          currentTime >= Math.max(s.startTime, spStart) &&
          currentTime <= Math.min(s.endTime, spEnd)
        );
      }) || null;

    if (!candidate) return null;

    // Also check if currentTime falls inside a genuine internal silent pause (>= 0.45s) between words
    if (candidate.words && candidate.words.length > 1) {
      const sortedWords = [...candidate.words].sort((a, b) => a.start - b.start);
      for (let i = 1; i < sortedWords.length; i++) {
        const prevW = sortedWords[i - 1];
        const currW = sortedWords[i];
        if (
          currW.start - prevW.end >= 0.45 &&
          currentTime > prevW.end + 0.015 &&
          currentTime < currW.start - 0.015
        ) {
          return null;
        }
      }
    }

    return candidate;
  }, [activeJob, currentTime, isCurrentlyInSilence]);

  // Compute live Timestamp QC, Translation QC, and Final QA Report
  const qaEvaluation = useMemo(() => {
    if (!activeJob) {
      return QualityAssuranceService.runFinalQaValidation({
        segments: [],
        glossaryTerms: settings.glossaryTerms,
      });
    }
    return QualityAssuranceService.runFinalQaValidation({
      segments: activeJob.segments,
      silenceIntervals: activeJob.silenceIntervals,
      speechIntervals: activeJob.speechIntervals,
      glossaryTerms: settings.glossaryTerms,
      avStreamDriftSec: activeJob.audioMetrics?.avStreamDriftSec,
    });
  }, [activeJob, settings.glossaryTerms]);

  const timingIssues: TimingIssue[] = qaEvaluation.timingIssues;
  const translationIssues: TranslationIssue[] = qaEvaluation.translationIssues;
  const finalQaReport = qaEvaluation.report;
  const totalQcIssues = timingIssues.length + translationIssues.length;

  const lowConfidenceSegments = useMemo(() => {
    if (!activeJob) return [];
    return activeJob.segments.filter(
      (s) =>
        s.verificationLabel === 'needs_review' ||
        s.verificationLabel === 'unresolved' ||
        timingIssues.some((i) => i.segmentId === s.id)
    );
  }, [activeJob, timingIssues]);

  const togglePlay = () => {
    if (!activeJob) return;
    if (isPlaying) {
      if (videoRef.current) videoRef.current.pause();
      setIsPlaying(false);
    } else {
      if (currentTime >= duration - 0.2) {
        seekTo(0);
      }
      setIsPlaying(true);
    }
  };

  const seekTo = (timeSec: number) => {
    const clamped = Math.max(0, Math.min(duration, Number(timeSec.toFixed(3))));
    setCurrentTime(clamped);
    if (videoRef.current) {
      videoRef.current.currentTime = clamped;
    }
  };

  const stepFrame = (direction: -1 | 1) => {
    if (isPlaying) {
      if (videoRef.current) videoRef.current.pause();
      setIsPlaying(false);
    }
    seekTo(currentTime + direction * frameStepSec);
  };

  const handleJumpToNextLowConfidence = () => {
    if (lowConfidenceSegments.length === 0) {
      setShowQcPanel(true);
      return;
    }
    const nextLow =
      lowConfidenceSegments.find((s) => s.startTime > currentTime + 0.05) ||
      lowConfidenceSegments[0];
    seekTo(nextLow.startTime + 0.05);
    const el = document.getElementById(`seg-card-${nextLow.id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Validate and select uploaded file
  const validateAndSelectFile = (file: File) => {
    setUploadError(null);
    setProbedDuration(null);

    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      setUploadError(
        `ဖိုင်အမျိုးအစား "${ext}" ကို လက်မခံပါ။ MP4, MKV, MOV, MP3, WAV, သို့မဟုတ် M4A ဖိုင်ကိုသာ ရွေးချယ်ပါ။`
      );
      setSelectedFile(null);
      return;
    }

    const maxBytes = settings.maxUploadSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      setUploadError(
        `ဖိုင်အရွယ်အစား (${(file.size / (1024 * 1024)).toFixed(1)} MB) သည် သတ်မှတ်ထားသော ${
          settings.maxUploadSizeMb
        } MB ထက် ကျော်လွန်နေပါသည်။`
      );
      setSelectedFile(null);
      return;
    }

    if (file.size === 0) {
      setUploadError('ရွေးချယ်ထားသော ဖိုင်မှာ အလွတ် (0 bytes) ဖြစ်နေပါသည်။');
      setSelectedFile(null);
      return;
    }

    if (selectedFileObjectUrl) {
      URL.revokeObjectURL(selectedFileObjectUrl);
    }

    const objectUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setSelectedFileObjectUrl(objectUrl);

    const mediaEl = document.createElement(
      ext === '.mp3' || ext === '.wav' || ext === '.m4a' ? 'audio' : 'video'
    );
    mediaEl.preload = 'metadata';
    mediaEl.onloadedmetadata = () => {
      if (Number.isFinite(mediaEl.duration) && mediaEl.duration > 0) {
        setProbedDuration(Number(mediaEl.duration.toFixed(2)));
      }
    };
    mediaEl.src = objectUrl;
  };

  const handleStartProcessing = async () => {
    if (!selectedFile) {
      setUploadError(
        'ကျေးဇူးပြု၍ ဗီဒီယို သို့မဟုတ် အသံဖိုင် တစ်ခုကို အရင်ရွေးချယ်ပါ (သို့မဟုတ် SRT/VTT ဖိုင် တင်ပါ)။'
      );
      return;
    }

    setIsUploading(true);
    setUploadProgress(5);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('thinkingMode', String(settings.thinkingMode));
      formData.append('targetLanguage', targetLangChoice);
      formData.append('sourceLanguageHint', sourceLangChoice);
      formData.append('videoCategory', settings.videoCategory);
      formData.append('timingMode', settings.timingMode);
      formData.append('processingMode', settings.processingMode);
      formData.append('translationStyle', settings.translationStyle);
      formData.append('maxLinesPerSubtitle', String(settings.maxLinesPerSubtitle));
      formData.append('maxCharsPerLine', String(settings.maxCharsPerLine));
      formData.append('minDurationSec', String(settings.minDurationSec));
      formData.append('maxDurationSec', String(settings.maxDurationSec));
      formData.append('autoCleanupTempFiles', String(settings.autoCleanupTempFiles));
      formData.append('glossaryTerms', JSON.stringify(settings.glossaryTerms));
      formData.append('characterMemory', JSON.stringify(settings.characterMemory || []));

      const createdJob = await new Promise<ProcessingJob>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/jobs/upload');

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const pct = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(pct);
          }
        };

        xhr.onload = () => {
          try {
            const parsed = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300 && parsed.job) {
              resolve(parsed.job as ProcessingJob);
            } else {
              reject(
                new Error(parsed.error || `ဖိုင်တင်ရာတွင် အမှားဖြစ်ပေါ်နေပါသည် (${xhr.status})`)
              );
            }
          } catch {
            reject(new Error('ဆာဗာမှ ပြန်လည်ဖြေကြားချက် မမှန်ကန်ပါ။'));
          }
        };

        xhr.onerror = () =>
          reject(new Error('ဖိုင်တင်နေစဉ် အင်တာနက်ချိတ်ဆက်မှု ပြတ်တောက်သွားပါသည်။'));
        xhr.send(formData);
      });

      const jobWithPreview: ProcessingJob = selectedFileObjectUrl
        ? { ...createdJob, mediaUrl: createdJob.mediaUrl || selectedFileObjectUrl }
        : createdJob;

      setJobs((prev) => [jobWithPreview, ...prev.filter((j) => j.id !== jobWithPreview.id)]);
      setSelectedJobId(jobWithPreview.id);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'ဖိုင်တင်ရာတွင် အမှားဖြစ်ပေါ်နေပါသည်။'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleCreateBlankProject = () => {
    setUploadError(null);
    const blankSegment: SubtitleSegment = {
      id: `seg-${Date.now()}-1`,
      index: 1,
      startTime: 0.5,
      endTime: 3.5,
      originalStartTime: 0.5,
      originalEndTime: 3.5,
      verifiedStartTime: 0.5,
      verifiedEndTime: 3.5,
      speechStartTime: 0.5,
      speechEndTime: 3.5,
      originalText: '',
      translatedText: '',
      speaker: 'Speaker 1',
      verificationLabel: 'verified',
      alignmentSource: 'manual_override',
    };

    const newJob: ProcessingJob = {
      id: `job-manual-${Date.now().toString().slice(-6)}`,
      fileName: selectedFile ? selectedFile.name : 'Manual_Subtitle_Project.srt',
      fileSize: selectedFile ? selectedFile.size : 0,
      durationSeconds: probedDuration || 30,
      format: 'UTF-8 Subtitle Project',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: 'completed',
      currentStage: 'ready',
      progress: 100,
      detectedLanguage: 'Manual Entry',
      detectedLanguageCode: 'my',
      videoCategory: settings.videoCategory,
      timingMode: settings.timingMode,
      processingMode: settings.processingMode,
      thinkingMode: settings.thinkingMode,
      modelUsed: settings.modelName,
      translationStyle: settings.translationStyle,
      mediaUrl: selectedFileObjectUrl || undefined,
      segments: [blankSegment],
      silenceIntervals: [
        { start: 0.0, end: 0.5, duration: 0.5 },
        { start: 3.5, end: probedDuration || 30, duration: Math.max(1, (probedDuration || 30) - 3.5) },
      ],
      speechIntervals: [{ start: 0.5, end: 3.5 }],
      stages: DEFAULT_PIPELINE_STAGES.map((s) => ({ ...s, status: 'completed', durationMs: 0 })),
    };

    setJobs((prev) => [newJob, ...prev]);
    setSelectedJobId(newJob.id);
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.job) {
        setJobs((prev) => prev.map((j) => (j.id === jobId ? data.job : j)));
      }
    } catch {
      // ignore
    }
  };

  const handleRetryJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/retry`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.job) {
        setJobs((prev) => prev.map((j) => (j.id === jobId ? data.job : j)));
        setSelectedJobId(jobId);
      } else if (data.error) {
        setUploadError(data.error);
      }
    } catch {
      // ignore
    }
  };

  const handleSrtImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    const text = await file.text();
    const parsedSegments = parseSrtContent(text).map((s) => ({
      ...s,
      originalStartTime: s.startTime,
      originalEndTime: s.endTime,
      verifiedStartTime: s.startTime,
      verifiedEndTime: s.endTime,
      speechStartTime: s.startTime,
      speechEndTime: s.endTime,
      verificationLabel: 'verified' as const,
      alignmentSource: 'manual_override' as const,
    }));
    if (parsedSegments.length === 0) {
      setUploadError('ရွေးချယ်ထားသော ဖိုင်ထဲတွင် စာတန်းထိုးများ ရှာမတွေ့ပါ။');
      return;
    }
    const maxEnd = Math.max(
      probedDuration || 10,
      parsedSegments.reduce((m, s) => Math.max(m, s.endTime), 10)
    );
    const importedJob: ProcessingJob = {
      id: `job-srt-${Date.now().toString().slice(-6)}`,
      fileName: file.name,
      fileSize: file.size,
      durationSeconds: maxEnd,
      format: 'SRT / VTT Subtitle',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: 'completed',
      currentStage: 'ready',
      progress: 100,
      detectedLanguage: 'SRT ဖိုင်',
      detectedLanguageCode: 'srt',
      videoCategory: settings.videoCategory,
      timingMode: settings.timingMode,
      processingMode: settings.processingMode,
      thinkingMode: settings.thinkingMode,
      modelUsed: settings.modelName,
      translationStyle: settings.translationStyle,
      mediaUrl: selectedFileObjectUrl || undefined,
      segments: parsedSegments,
      stages: DEFAULT_PIPELINE_STAGES.map((s) => ({ ...s, status: 'completed', durationMs: 10 })),
    };
    setJobs((prev) => [importedJob, ...prev]);
    setSelectedJobId(importedJob.id);
    e.target.value = '';
  };

  const handleAddCharacterMemory = () => {
    if (!newCharName.trim() || !newCharBurmese.trim()) return;
    const nextList = [
      ...(settings.characterMemory || []),
      {
        name: newCharName.trim(),
        burmeseName: newCharBurmese.trim(),
        relationship: newCharRelation.trim() || undefined,
      },
    ];
    handleUpdateSettings({ characterMemory: nextList });
    setNewCharName('');
    setNewCharBurmese('');
    setNewCharRelation('');
  };

  const handleRemoveCharacterMemory = (idx: number) => {
    const nextList = (settings.characterMemory || []).filter((_, i) => i !== idx);
    handleUpdateSettings({ characterMemory: nextList });
  };

  const handleAddGlossaryTerm = () => {
    if (!newGlossarySource.trim() || !newGlossaryBurmese.trim()) return;
    const nextList = [
      ...(settings.glossaryTerms || []),
      {
        source: newGlossarySource.trim(),
        burmese: newGlossaryBurmese.trim(),
      },
    ];
    handleUpdateSettings({ glossaryTerms: nextList });
    setNewGlossarySource('');
    setNewGlossaryBurmese('');
  };

  const handleRemoveGlossaryTerm = (idx: number) => {
    const nextList = (settings.glossaryTerms || []).filter((_, i) => i !== idx);
    handleUpdateSettings({ glossaryTerms: nextList });
  };

  const handleUpdateSegments = (
    jobId: string,
    updatedSegments: SubtitleSegment[],
    recordHistory = true
  ) => {
    if (recordHistory) {
      const currentJob = jobs.find((j) => j.id === jobId);
      if (currentJob) {
        setUndoStacks((prev) => ({
          ...prev,
          [jobId]: [...(prev[jobId] || []).slice(-19), structuredClone(currentJob.segments)],
        }));
        setRedoStacks((prev) => ({ ...prev, [jobId]: [] }));
      }
    }

    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, segments: updatedSegments } : j))
    );
    void fetch(`/api/jobs/${jobId}/segments`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ segments: updatedSegments }),
    }).catch(() => {});
  };

  const handleUndo = () => {
    if (!activeJob) return;
    const stack = undoStacks[activeJob.id] || [];
    if (stack.length === 0) return;
    const previousSegments = stack[stack.length - 1];
    setUndoStacks((prev) => ({
      ...prev,
      [activeJob.id]: stack.slice(0, -1),
    }));
    setRedoStacks((prev) => ({
      ...prev,
      [activeJob.id]: [
        ...(prev[activeJob.id] || []),
        structuredClone(activeJob.segments),
      ],
    }));
    handleUpdateSegments(activeJob.id, previousSegments, false);
  };

  const handleRedo = () => {
    if (!activeJob) return;
    const stack = redoStacks[activeJob.id] || [];
    if (stack.length === 0) return;
    const nextSegments = stack[stack.length - 1];
    setRedoStacks((prev) => ({
      ...prev,
      [activeJob.id]: stack.slice(0, -1),
    }));
    setUndoStacks((prev) => ({
      ...prev,
      [activeJob.id]: [
        ...(prev[activeJob.id] || []),
        structuredClone(activeJob.segments),
      ],
    }));
    handleUpdateSegments(activeJob.id, nextSegments, false);
  };

  const handleChangeTimingMode = (nextMode: TimingMode) => {
    handleUpdateSettings({ timingMode: nextMode });
    if (!activeJob) return;
    const adjusted = applyTimingModeToSegments(activeJob.segments, nextMode, {
      minDurationSec: settings.minDurationSec,
      maxDurationSec: settings.maxDurationSec,
      silenceIntervals: activeJob.silenceIntervals,
    });
    handleUpdateSegments(activeJob.id, adjusted);
  };

  const handleApproveTimingFix = (issue: TimingIssue) => {
    if (!activeJob) return;
    if (issue.suggestedStartTime === undefined && issue.suggestedEndTime === undefined) return;
    const seg = activeJob.segments.find((s) => s.id === issue.segmentId);
    if (!seg) return;
    const next = SubtitleComposer.updateTimestampPreservingTranslation(
      activeJob.segments,
      issue.segmentId,
      issue.suggestedStartTime ?? seg.startTime,
      issue.suggestedEndTime ?? seg.endTime,
      'qc_approved',
      `Approved QC suggestion: ${issue.type}`
    );
    handleUpdateSegments(activeJob.id, next);
  };

  const handleApproveTranslationFix = (issue: TranslationIssue) => {
    if (!activeJob || !issue.suggestedText) return;
    const next = SubtitleComposer.updateTranslationPreservingTimestamps(
      activeJob.segments,
      issue.segmentId,
      issue.suggestedText
    );
    handleUpdateSegments(activeJob.id, next);
  };

  const handleSegmentTextChange = (
    segId: string,
    field: 'translatedText' | 'originalText' | 'speaker',
    value: string
  ) => {
    if (!activeJob) return;
    if (field === 'translatedText') {
      const next = SubtitleComposer.updateTranslationPreservingTimestamps(
        activeJob.segments,
        segId,
        value
      );
      handleUpdateSegments(activeJob.id, next);
      return;
    }
    const next = activeJob.segments.map((s) =>
      s.id === segId ? { ...s, [field]: value } : s
    );
    handleUpdateSegments(activeJob.id, next);
  };

  const handleTimestampBlur = (
    segId: string,
    field: 'startTime' | 'endTime',
    rawVal: string
  ) => {
    if (!activeJob) return;
    const draftKey = `${segId}_${field}`;
    const parsed = parseSrtTimestamp(rawVal);
    const seg = activeJob.segments.find((s) => s.id === segId);
    if (parsed !== null && seg) {
      const newStart = field === 'startTime' ? parsed : seg.startTime;
      const newEnd = field === 'endTime' ? parsed : seg.endTime;
      const next = SubtitleComposer.updateTimestampPreservingTranslation(
        activeJob.segments,
        segId,
        newStart,
        newEnd,
        'user_manual',
        `User manually adjusted ${field} in editor`
      );
      handleUpdateSegments(activeJob.id, next);
    }
    setTimeDrafts((prev) => {
      const copy = { ...prev };
      delete copy[draftKey];
      return copy;
    });
  };

  const handleAddSegmentAfter = (index: number) => {
    if (!activeJob) return;
    const prevSeg = activeJob.segments[index];
    const nextSeg = activeJob.segments[index + 1];
    const startTime = prevSeg ? Number((prevSeg.endTime + 0.1).toFixed(2)) : 0.0;
    const endTime = nextSeg
      ? Math.max(
          Number((startTime + 2.0).toFixed(2)),
          Number((nextSeg.startTime - 0.1).toFixed(2))
        )
      : Number((startTime + 3.0).toFixed(2));

    const newSegment: SubtitleSegment = {
      id: `seg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      index: index + 2,
      startTime,
      endTime: Math.max(startTime + 1.0, endTime),
      originalStartTime: startTime,
      originalEndTime: Math.max(startTime + 1.0, endTime),
      verifiedStartTime: startTime,
      verifiedEndTime: Math.max(startTime + 1.0, endTime),
      speechStartTime: startTime,
      speechEndTime: Math.max(startTime + 1.0, endTime),
      originalText: '',
      translatedText: '',
      speaker: prevSeg?.speaker || 'Speaker 1',
      verificationLabel: 'verified',
      alignmentSource: 'manual_override',
    };

    const updated = [...activeJob.segments];
    updated.splice(index + 1, 0, newSegment);
    handleUpdateSegments(
      activeJob.id,
      updated.map((s, idx) => ({ ...s, index: idx + 1 }))
    );
  };

  const handleDeleteSegment = (segId: string) => {
    if (!activeJob || activeJob.segments.length <= 1) return;
    const updated = activeJob.segments
      .filter((s) => s.id !== segId)
      .map((s, idx) => ({ ...s, index: idx + 1 }));
    handleUpdateSegments(activeJob.id, updated);
  };

  const handleSplitSegment = (segId: string) => {
    if (!activeJob) return;
    const updated = splitSubtitleSegment(activeJob.segments, segId);
    handleUpdateSegments(activeJob.id, updated);
  };

  const handleMergeSegmentWithNext = (segId: string) => {
    if (!activeJob) return;
    const updated = mergeSubtitleSegments(activeJob.segments, segId);
    handleUpdateSegments(activeJob.id, updated);
  };

  const handleSearchAndReplace = () => {
    if (!activeJob || !searchQuery.trim()) return;
    const { updatedSegments, replacementsCount } = searchAndReplaceSegments(
      activeJob.segments,
      searchQuery,
      replaceText,
      'translated'
    );
    handleUpdateSegments(activeJob.id, updatedSegments);
    setReplaceFeedback(
      replacementsCount > 0
        ? `"${searchQuery}" ကို ${replacementsCount} နေရာတွင် အစားထိုးပြင်ဆင်ပြီးပါပြီ။`
        : `"${searchQuery}" စာသား ရှာမတွေ့ပါ။`
    );
  };

  const handleHighThinkingRefine = async () => {
    if (!activeJob) return;
    setIsRefining(true);
    setRefineFeedback(null);
    try {
      const response = await fetch('/api/subtitles/refine-burmese', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segments: activeJob.segments,
          instruction:
            'မြန်မာစာတန်းထိုးများကို ပိုမိုသဘာဝကျသော စကားပြောဟန်ဖြစ်အောင် ပြင်ဆင်ပေးပါ။ မူရင်းအချိန်မှတ်တမ်းကို မပြောင်းပါနှင့်။',
          translationStyle: settings.translationStyle,
          videoCategory: settings.videoCategory,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'ပြင်ဆင်မှု မအောင်မြင်ပါ');
      }
      if (Array.isArray(data.updatedSegments)) {
        handleUpdateSegments(activeJob.id, data.updatedSegments);
        setRefineFeedback(`${data.reasoningSummary} (${data.modelUsed})`);
      }
    } catch (err) {
      setRefineFeedback(
        `အသိပေးချက် - ${
          err instanceof Error ? err.message : 'Gemini ဆာဗာသို့ ချိတ်ဆက်မရပါ'
        }`
      );
    } finally {
      setIsRefining(false);
    }
  };

  const handleExportSubtitle = (
    job: ProcessingJob,
    format: SubtitleExportFormat,
    mode: 'translated' | 'original' | 'bilingual'
  ) => {
    const exported = exportSubtitleContent(
      job.segments,
      format,
      mode,
      job.fileName,
      settings.subtitleStyle
    );
    const contentWithBom = '\uFEFF' + exported.content;
    const blob = new Blob([contentWithBom], { type: exported.mimeType });
    const url = URL.createObjectURL(blob);
    const baseName = job.fileName.replace(/\.[^/.]+$/, '');
    const langTag =
      mode === 'translated'
        ? '.my'
        : mode === 'original'
        ? `.${job.detectedLanguageCode || 'orig'}`
        : '.bilingual';

    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}${langTag}${exported.extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopySrt = async () => {
    if (!activeJob) return;
    const { content } = exportSubtitleContent(
      activeJob.segments,
      'srt',
      'translated',
      activeJob.fileName,
      settings.subtitleStyle
    );
    await navigator.clipboard.writeText(content);
    setCopiedSrt(true);
    setTimeout(() => setCopiedSrt(false), 2000);
  };

  const waveformBars = useMemo(() => {
    if (!activeJob) return [];
    if (activeJob.waveformPeaks && activeJob.waveformPeaks.length > 0) {
      return activeJob.waveformPeaks;
    }
    return Array.from({ length: 100 }, (_, i) => {
      const t = (i / 100) * duration;
      const inSub = activeJob.segments.some((s) => t >= s.startTime && t <= s.endTime);
      return inSub ? 0.65 : 0.06;
    });
  }, [activeJob, duration]);

  const allWordsFlat = useMemo(() => {
    if (!activeJob) return [];
    return activeJob.segments.flatMap((s) => s.words || []);
  }, [activeJob]);

  const canUndo = activeJob ? (undoStacks[activeJob.id] || []).length > 0 : false;
  const canRedo = activeJob ? (redoStacks[activeJob.id] || []).length > 0 : false;

  const subStyle = settings.subtitleStyle || DEFAULT_SETTINGS.subtitleStyle!;
  const liveFontSizeClass =
    subStyle.fontSize === 'sm'
      ? 'text-xs sm:text-sm'
      : subStyle.fontSize === 'lg'
      ? 'text-lg sm:text-xl'
      : 'text-base sm:text-lg';

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col font-myanmar">
      {/* Minimal Top Bar with Settings Icon in Top-Right Corner */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-slate-800/90 bg-[#0B0F17]/95 backdrop-blur-md">
        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            setViewMode('home');
          }}
          className="text-base sm:text-lg font-bold tracking-tight text-slate-50 whitespace-nowrap shrink-0"
        >
          <span>မင်္ဂလာစာတန်းထိုး</span>
          <span className="hidden sm:inline text-slate-300 font-normal">
            {' '}
            · AI Auto Subtitle Studio
          </span>
        </a>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'api_settings' ? 'home' : 'api_settings')}
            aria-label="API သတ်မှတ်ချက်များ"
            className={`px-3 sm:px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              viewMode === 'api_settings'
                ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-100 border-slate-700'
            }`}
          >
            <Settings
              className={`w-4 h-4 shrink-0 ${
                viewMode === 'api_settings' ? 'text-slate-950' : 'text-amber-400'
              }`}
            />
            <span>API သတ်မှတ်ချက်များ</span>
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {viewMode === 'api_settings' ? (
          <ApiSettingsPage
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onBackHome={() => setViewMode('home')}
          />
        ) : (
          <div className="space-y-6">
            {/* Simple 4-Step Primary Workflow Banner */}
            <section
              aria-label="လုပ်ငန်းစဉ် အဆင့်များ"
              className="p-4 rounded-xl bg-slate-900/60 border border-slate-800"
            >
              <div className="flex flex-wrap items-center justify-center sm:justify-between gap-2 text-xs sm:text-sm font-medium text-slate-200">
                <span className="text-amber-400 font-semibold">၁။ ဗီဒီယိုတင်ရန်</span>
                <ArrowRight className="w-4 h-4 text-slate-500 shrink-0" />
                <span>၂။ အသံတိတ်ချိန်ညှိ ဘာသာပြန်ရန်</span>
                <ArrowRight className="w-4 h-4 text-slate-500 shrink-0" />
                <span>၃။ အသံလှိုင်းနှင့် စာတန်းထိုးကြည့်ရန်</span>
                <ArrowRight className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="text-emerald-400 font-semibold">
                  ၄။ SRT / VTT / ASS ဒေါင်းလုဒ်လုပ်ရန်
                </span>
              </div>
            </section>

            {/* STEP 1 & 2 & 3: VIDEO UPLOAD + CATEGORY, PROCESSING PROFILE & TIMING MODE + START BUTTON */}
            <section className="p-5 sm:p-6 rounded-xl bg-slate-900/40 border border-slate-800 space-y-6">
              {/* 1. Video Upload */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-slate-100">
                    ၁။ ဗီဒီယို သို့မဟုတ် အသံဖိုင် တင်ရန်
                  </h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={srtInputRef}
                      type="file"
                      accept=".srt,.vtt"
                      onChange={handleSrtImport}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => srtInputRef.current?.click()}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      <span>SRT / VTT ဖိုင် တင်ရန်</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateBlankProject}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 text-amber-400" />
                      <span>စာတန်းထိုးအသစ် ကိုယ်တိုင်ရေးသားရန်</span>
                    </button>
                  </div>
                </div>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) validateAndSelectFile(f);
                  }}
                  className={`border-2 border-dashed rounded-xl p-6 sm:p-8 text-center transition-colors ${
                    isDragging
                      ? 'border-amber-400 bg-amber-500/10'
                      : 'border-slate-700 hover:border-slate-600 bg-slate-950/50'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".mp4,.mkv,.mov,.mp3,.wav,.m4a,.webm"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) validateAndSelectFile(f);
                    }}
                    className="hidden"
                  />

                  <div className="mx-auto w-11 h-11 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-3">
                    <Upload className="w-5 h-5 text-amber-400" />
                  </div>

                  <p className="text-sm sm:text-base font-semibold text-slate-100">
                    ဗီဒီယို သို့မဟုတ် အသံဖိုင်ကို ဤနေရာသို့ ဆွဲထည့်ပါ
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    လက်ခံသော ဖိုင်အမျိုးအစားများ - MP4, MKV, MOV, MP3, WAV, M4A (အများဆုံး{' '}
                    {settings.maxUploadSizeMb} MB)
                  </p>

                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-600 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                    >
                      ဖိုင်ရွေးချယ်ရန်
                    </button>
                  </div>
                </div>

                {/* Selected File Info */}
                {selectedFile && (
                  <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {selectedFile.name.match(/\.(mp3|wav|m4a)$/i) ? (
                        <FileAudio className="w-6 h-6 text-amber-400 shrink-0" />
                      ) : (
                        <FileVideo className="w-6 h-6 text-amber-400 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-semibold text-slate-100 truncate">
                          {selectedFile.name}
                        </p>
                        <p className="text-xs text-slate-400 font-mono tabular-nums">
                          {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                          {probedDuration !== null
                            ? ` · ကြာချိန် ${formatDisplayTimecode(probedDuration)}`
                            : ''}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedFileObjectUrl) {
                          URL.revokeObjectURL(selectedFileObjectUrl);
                        }
                        setSelectedFile(null);
                        setSelectedFileObjectUrl(null);
                        setProbedDuration(null);
                      }}
                      className="text-xs text-slate-400 hover:text-rose-400 cursor-pointer shrink-0"
                    >
                      ဖယ်ရှားရန်
                    </button>
                  </div>
                )}

                {uploadError && (
                  <div
                    role="alert"
                    className="p-3.5 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-200 text-xs flex items-start gap-2.5"
                  >
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span className="break-words">{uploadError}</span>
                  </div>
                )}
              </div>

              {/* 2. Language, Video Category, Processing Mode & Silence-Aware Timing Mode */}
              <div className="pt-4 border-t border-slate-800/80 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-slate-100">
                    ၂။ ဘာသာစကား၊ ဗီဒီယိုအမျိုးအစား၊ တိကျမှုအဆင့်နှင့် အသံတိတ်ချိန်ညှိစနစ်
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowMemoryPanel((v) => !v)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      ဇာတ်ကောင်အမည်နှင့် အဘိဓာန် မှတ်ဉာဏ် (
                      {(settings.characterMemory?.length || 0) +
                        (settings.glossaryTerms?.length || 0)}
                      )
                    </span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="source-lang-select"
                      className="block text-xs font-medium text-slate-300"
                    >
                      မူရင်း ဗီဒီယို ဘာသာစကား
                    </label>
                    <select
                      id="source-lang-select"
                      value={sourceLangChoice}
                      onChange={(e) => setSourceLangChoice(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-100"
                    >
                      <option value="auto">အလိုအလျောက် စစ်ဆေးမည် (Auto Detect)</option>
                      <option value="en">အင်္ဂလိပ် (English)</option>
                      <option value="ja">ဂျပန် (Japanese)</option>
                      <option value="ko">ကိုရီးယား (Korean)</option>
                      <option value="zh">တရုတ် (Chinese)</option>
                      <option value="th">ထိုင်း (Thai)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="target-lang-select"
                      className="block text-xs font-medium text-slate-300"
                    >
                      ဘာသာပြန်မည့် ဘာသာစကား
                    </label>
                    <select
                      id="target-lang-select"
                      value={targetLangChoice}
                      onChange={(e) => setTargetLangChoice(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-100"
                    >
                      <option value="Myanmar (Burmese Unicode)">
                        မြန်မာဘာသာ (Myanmar Unicode)
                      </option>
                      <option value="English">အင်္ဂလိပ်ဘာသာ (English)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="video-category-select"
                      className="block text-xs font-medium text-slate-300"
                    >
                      ဗီဒီယို အမျိုးအစား (Video Category)
                    </label>
                    <select
                      id="video-category-select"
                      value={settings.videoCategory}
                      onChange={(e) =>
                        handleUpdateSettings({
                          videoCategory: e.target.value as VideoCategory,
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-100"
                    >
                      <option value="general">အထွေထွေ ဗီဒီယို (General)</option>
                      <option value="anime">အန်နီမေးရှင်း (Anime)</option>
                      <option value="movies">ရုပ်ရှင်ဇာတ်ကား (Movies)</option>
                      <option value="drama">ဒရာမာ ဇာတ်လမ်း (Drama)</option>
                      <option value="series">ဇာတ်လမ်းတွဲ (TV Series)</option>
                      <option value="documentary">မှတ်တမ်းရုပ်ရှင် (Documentary)</option>
                      <option value="educational">ပညာရေးနှင့် သင်ခန်းစာ (Educational)</option>
                      <option value="youtube">YouTube ဗီဒီယို (YouTube / Vlog)</option>
                      <option value="interview">အင်တာဗျူးနှင့် စကားဝိုင်း (Interview)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="home-style-select"
                      className="block text-xs font-medium text-slate-300"
                    >
                      မြန်မာစကားပြော ပုံစံ (Translation Style)
                    </label>
                    <select
                      id="home-style-select"
                      value={settings.translationStyle}
                      onChange={(e) =>
                        handleUpdateSettings({
                          translationStyle: e.target.value as AppSettings['translationStyle'],
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-100"
                    >
                      <option value="conversational">သဘာဝ စကားပြောဟန်</option>
                      <option value="cinema">ရုပ်ရှင် စကားပြောဟန်</option>
                      <option value="documentary">မှတ်တမ်းရုပ်ရှင်ဟန်</option>
                      <option value="formal">စာပေ/သတင်းဟန်</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="processing-mode-select"
                      className="block text-xs font-medium text-emerald-300"
                    >
                      လုပ်ဆောင်မှု တိကျမှုအဆင့် (Processing Mode)
                    </label>
                    <select
                      id="processing-mode-select"
                      value={settings.processingMode}
                      onChange={(e) =>
                        handleUpdateSettings({
                          processingMode: e.target.value as ProcessingMode,
                        })
                      }
                      className="w-full bg-slate-950 border border-emerald-500/40 rounded-lg px-3 py-2.5 text-xs text-slate-100"
                    >
                      <option value="maximum_accuracy">
                        Maximum Quality Mode (10-Stage Phoneme Align + 4-Pass Refinement)
                      </option>
                      <option value="balanced">
                        Balanced Mode (2-Pass Refinement · မြန်ဆန်မှုနှင့် တိကျမှုမျှတ)
                      </option>
                      <option value="fast">Fast Mode (1-Pass · အမြန်ဘာသာပြန်စနစ်)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="timing-mode-select"
                      className="block text-xs font-medium text-amber-300"
                    >
                      စာတန်းထိုး အချိန်ကိုက်ညှိစနစ် (Speech-Only Sync Mode)
                    </label>
                    <select
                      id="timing-mode-select"
                      value={settings.timingMode}
                      onChange={(e) => handleChangeTimingMode(e.target.value as TimingMode)}
                      className="w-full bg-slate-950 border border-amber-500/40 rounded-lg px-3 py-2.5 text-xs text-slate-100"
                    >
                      <option value="exact_speech">
                        ၁။ Speech-Only Sync (Default · စကားပြောစ=ပေါ် / စကားပြောရပ်=ချက်ချင်းပျောက်)
                      </option>
                      <option value="readability">
                        ၂။ Strict Speech-Clamped (အသံတိတ်ချိန်သို့ လုံးဝမကျော်ဘဲ ချိန်ညှိမည်)
                      </option>
                      <option value="manual">
                        ၃။ Manual Timing (အချိန်မှတ်တမ်းကို စိတ်ကြိုက်ပြင်ဆင်မည်)
                      </option>
                    </select>
                  </div>
                </div>

                {/* Collapsible Context & Character Memory Panel (Section 6) */}
                {showMemoryPanel && (
                  <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-4">
                    <div>
                      <h3 className="text-xs font-bold text-amber-300">
                        ဇာတ်ကောင်အမည်၊ ဆက်ဆံရေးနှင့် အဘိဓာန် မှတ်ဉာဏ် (Context &amp; Character Memory)
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        ဗီဒီယိုတစ်ခုလုံးတွင် ဇာတ်ကောင်နာမည်များ၊ နာမ်စားများနှင့် အထူးအသုံးအနှုန်းများ တစ်ပြေးညီ မှန်ကန်စေရန် သတ်မှတ်နိုင်ပါသည်။
                      </p>
                    </div>

                    {/* Character Memory Section */}
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-slate-200 block">
                        ၁။ ဇာတ်ကောင်အမည်နှင့် ဆက်ဆံရေး (Character Memory)
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          placeholder="မူရင်းအမည် (ဥပမာ - Takeshi)"
                          value={newCharName}
                          onChange={(e) => setNewCharName(e.target.value)}
                          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100"
                        />
                        <input
                          type="text"
                          placeholder="မြန်မာအမည် (ဥပမာ - တာကေရှီ)"
                          value={newCharBurmese}
                          onChange={(e) => setNewCharBurmese(e.target.value)}
                          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100"
                        />
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="ဆက်ဆံရေး/နာမ်စား (ဥပမာ - ဆရာ/တပည့်)"
                            value={newCharRelation}
                            onChange={(e) => setNewCharRelation(e.target.value)}
                            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100"
                          />
                          <button
                            type="button"
                            onClick={handleAddCharacterMemory}
                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-lg shrink-0 cursor-pointer"
                          >
                            ထည့်ရန်
                          </button>
                        </div>
                      </div>

                      {settings.characterMemory && settings.characterMemory.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {settings.characterMemory.map((c, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200"
                            >
                              <span>
                                {c.name} → <strong className="text-amber-300">{c.burmeseName}</strong>
                                {c.relationship ? ` (${c.relationship})` : ''}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveCharacterMemory(idx)}
                                className="text-slate-400 hover:text-rose-400 cursor-pointer"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Glossary Memory Section */}
                    <div className="space-y-2 pt-2 border-t border-slate-800/80">
                      <span className="text-xs font-semibold text-slate-200 block">
                        ၂။ ပုံသေ ဝေါဟာရ အဘိဓာန် (Glossary Memory)
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          placeholder="မူရင်းစကားလုံး (ဥပမာ - Artificial Intelligence)"
                          value={newGlossarySource}
                          onChange={(e) => setNewGlossarySource(e.target.value)}
                          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100"
                        />
                        <input
                          type="text"
                          placeholder="မြန်မာဘာသာပြန် (ဥပမာ - ဉာဏ်ရည်တုနည်းပညာ)"
                          value={newGlossaryBurmese}
                          onChange={(e) => setNewGlossaryBurmese(e.target.value)}
                          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100"
                        />
                        <button
                          type="button"
                          onClick={handleAddGlossaryTerm}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 font-semibold text-xs rounded-lg cursor-pointer"
                        >
                          ဝေါဟာရ အသစ်ထည့်ရန်
                        </button>
                      </div>

                      {settings.glossaryTerms && settings.glossaryTerms.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {settings.glossaryTerms.map((g, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200"
                            >
                              <span>
                                {g.source} → <strong className="text-emerald-300">{g.burmese}</strong>
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveGlossaryTerm(idx)}
                                className="text-slate-400 hover:text-rose-400 cursor-pointer"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Start Processing Button */}
              <div className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="text-xs text-slate-400">
                  10-Stage Phoneme &amp; VAD Timestamp Engine (Groq{' '}
                  <span className="font-mono text-slate-200">whisper-large-v3</span>) ·
                  မြန်မာဘာသာပြန်ခြင်း (
                  <span className="font-mono text-amber-400 font-semibold">
                    {settings.modelName === 'gemini-3.1-pro-preview'
                      ? 'Gemini 3.1 Pro'
                      : settings.modelName}
                  </span>
                  )
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  {activeJob?.status === 'processing' && (
                    <button
                      type="button"
                      onClick={() => void handleCancelJob(activeJob.id)}
                      className="px-4 py-3 bg-rose-950/70 hover:bg-rose-900 text-rose-200 border border-rose-700 font-semibold text-xs rounded-xl transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>ရပ်တန့်ရန်</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isUploading || activeJob?.status === 'processing'}
                    onClick={() => void handleStartProcessing()}
                    className="w-full sm:w-auto px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-xl transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    {isUploading || activeJob?.status === 'processing' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>စာတန်းထိုး ထုတ်လုပ်နေပါသည်...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-current shrink-0" />
                        <span>စတင်ဘာသာပြန်ရန်</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </section>

            {/* IF NO ACTIVE JOB EXISTS YET: CLEAN REAL-WORKFLOW PROMPT (NO DEMO DATA) */}
            {!activeJob ? (
              <section
                data-testid="empty-workspace-state"
                className="p-6 sm:p-8 rounded-xl bg-slate-900/40 border border-slate-800 text-center space-y-4"
              >
                <div className="mx-auto w-12 h-12 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-center">
                  <Activity className="w-6 h-6 text-amber-400" />
                </div>
                <div className="space-y-1.5 max-w-xl mx-auto">
                  <h2 className="text-base sm:text-lg font-bold text-slate-100">
                    စာတန်းထိုး စတူဒီယို အသင့်ရှိနေပါသည် (NO SPEECH = NO SUBTITLE)
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                    အပေါ်ရှိ ဖိုင်တင်ရန်နေရာတွင် သင်၏ ဗီဒီယို သို့မဟုတ် အသံဖိုင်ကို ရွေးချယ်ပြီး{' '}
                    <span className="text-amber-300 font-semibold">“စတင်ဘာသာပြန်ရန်”</span> ကိုနှိပ်ပါ။
                    ရှိပြီးသား SRT/VTT ဖိုင်ကို တင်၍ ပြင်ဆင်လိုပါက သို့မဟုတ် ကိုယ်တိုင်အသစ်ရေးသားလိုပါက အောက်ပါခလုတ်များကို အသုံးပြုနိုင်ပါသည်။
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>ဗီဒီယို / အသံဖိုင် ရွေးချယ်ရန်</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => srtInputRef.current?.click()}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-semibold text-xs rounded-xl inline-flex items-center gap-2 cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <span>SRT / VTT ဖိုင် တင်ရန်</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateBlankProject}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 font-semibold text-xs rounded-xl inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-amber-400" />
                    <span>စာတန်းထိုး ပရောဂျက်အသစ် စတင်ရန်</span>
                  </button>
                </div>
              </section>
            ) : (
              <>
                {/* STEP 4: PROCESSING PROGRESS & AUDIO SIGNAL / QA METRICS */}
                <section className="p-5 sm:p-6 rounded-xl bg-slate-900/40 border border-slate-800 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base sm:text-lg font-bold text-slate-100">
                        လုပ်ဆောင်နေမှု အခြေအနေနှင့် အသံအရည်အသွေး စစ်ဆေးချက် (Pipeline &amp; QA)
                      </h2>
                      <p className="text-xs text-slate-400">
                        လက်ရှိဖိုင် -{' '}
                        <span className="text-slate-200 font-medium">{activeJob.fileName}</span> ·
                        မူရင်းဘာသာစကား -{' '}
                        <span className="text-amber-300">{activeJob.detectedLanguage}</span>
                        {activeJob.audioMetrics
                          ? ` · Noise Floor ${activeJob.audioMetrics.noiseFloorDb}dB · Adaptive VAD ${activeJob.audioMetrics.adaptiveVadThresholdDb}dB · ${activeJob.audioMetrics.frameRateFps}fps`
                          : ''}
                      </p>
                    </div>

                    <span className="text-sm font-mono tabular-nums font-bold text-amber-400">
                      {isUploading ? `${uploadProgress}%` : `${activeJob.progress}%`}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-200 ${
                        activeJob.status === 'failed' || activeJob.status === 'cancelled'
                          ? 'bg-rose-500'
                          : activeJob.status === 'completed'
                          ? 'bg-emerald-500'
                          : 'bg-amber-500'
                      }`}
                      style={{ width: `${isUploading ? uploadProgress : activeJob.progress}%` }}
                    />
                  </div>

                  {/* Compact 4-Stage Pipeline Status Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                    {[
                      {
                        title: '၁။ အသံနှင့် Adaptive VAD',
                        sub: '16kHz PCM + Noise Floor',
                        done: activeJob.progress >= 45,
                        active: activeJob.progress > 0 && activeJob.progress < 45,
                      },
                      {
                        title: '၂။ Multi-Pass ASR & Phoneme',
                        sub: 'Groq whisper-large-v3 + Align',
                        done: activeJob.progress >= 78,
                        active: activeJob.progress >= 45 && activeJob.progress < 78,
                      },
                      {
                        title: '၃။ မြန်မာဘာသာပြန်ခြင်း',
                        sub:
                          settings.modelName === 'gemini-3.1-pro-preview'
                            ? 'Gemini 3.1 Pro (Context)'
                            : `Gemini (${settings.modelName})`,
                        done: activeJob.progress >= 95,
                        active: activeJob.progress >= 78 && activeJob.progress < 95,
                      },
                      {
                        title: '၄။ Final QA နှင့် ဖိုင်ထုတ်ခြင်း',
                        sub: 'SRT / VTT / ASS UTF-8',
                        done: activeJob.progress === 100 && activeJob.status === 'completed',
                        active: activeJob.progress >= 95 && activeJob.progress < 100,
                      },
                    ].map((step, i) => (
                      <div
                        key={i}
                        className={`p-3 rounded-lg border flex items-center gap-2.5 ${
                          step.done
                            ? 'bg-emerald-950/20 border-emerald-800/50 text-slate-100'
                            : step.active
                            ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                            : 'bg-slate-950/40 border-slate-800 text-slate-400'
                        }`}
                      >
                        {step.done ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : step.active ? (
                          <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-slate-700 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{step.title}</p>
                          <p className="text-[11px] text-slate-400 font-mono truncate">{step.sub}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Final Quality Assurance Summary Strip (Section 10: Explicit Verification Labels, Never Fake 100% Score) */}
                  <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
                    <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums">
                      <span>စာကြောင်းစုစုပေါင်း: {finalQaReport.totalSegments}</span>
                      <span aria-hidden="true">·</span>
                      <span>စကားလုံးစုစုပေါင်း: {finalQaReport.totalWords}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-emerald-300">
                        Verified: {finalQaReport.verifiedSegments}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="text-sky-300">
                        High Confidence: {finalQaReport.highConfidenceSegments}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="text-amber-300">
                        Needs Review: {finalQaReport.segmentsNeedingReview}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="text-emerald-300">
                        Silence Violations: {finalQaReport.detectedSilenceViolations ?? 0}
                      </span>
                    </div>

                    {lowConfidenceSegments.length > 0 && (
                      <button
                        type="button"
                        onClick={handleJumpToNextLowConfidence}
                        className="px-3 py-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-medium cursor-pointer"
                      >
                        စစ်ဆေးရန်လိုအပ်သော စာကြောင်းသို့ သွားရန် ({lowConfidenceSegments.length})
                      </button>
                    )}
                  </div>

                  {(activeJob.status === 'failed' || activeJob.status === 'cancelled') && (
                    <div className="p-4 rounded-lg bg-rose-950/50 border border-rose-800 space-y-3 overflow-hidden">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-rose-200 leading-relaxed break-words min-w-0">
                          {activeJob.error || 'လုပ်ငန်းစဉ် ရပ်တန့်သွားပါသည်။'}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={() => void handleRetryJob(activeJob.id)}
                          className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>ပြန်လည်စမ်းသပ်ရန်</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMode('api_settings')}
                          className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/40 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Settings className="w-3.5 h-3.5 text-amber-400" />
                          <span>API သတ်မှတ်ချက်များ စစ်ဆေးရန်</span>
                        </button>
                      </div>
                    </div>
                  )}
                </section>

                {/* STEP 5: SUBTITLE PREVIEW, ZOOMABLE WAVEFORM, WORD-LEVEL TIMELINE & EDITOR */}
                <section className="p-5 sm:p-6 rounded-xl bg-slate-900/40 border border-slate-800 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                    <div>
                      <h2 className="text-base sm:text-lg font-bold text-slate-100">
                        စာတန်းထိုးကြည့်ရန်၊ အသံလှိုင်းနှင့် ပြင်ဆင်ရန် (Subtitle Studio &amp; Waveform)
                      </h2>
                      <p className="text-xs text-slate-400">
                        စကားပြောသည့်အချိန်တွင်သာ စာတန်းထိုးပေါ်ပြီး စကားပြောရပ်သည်နှင့် အသံတိတ်ချိန်တွင် စာတန်းထိုး အလိုအလျောက် ပျောက်ကွယ်ပါသည်။
                      </p>
                    </div>

                    {/* Switch between processed files */}
                    <div className="flex items-center gap-2">
                      <label htmlFor="home-job-select" className="text-xs text-slate-400 shrink-0">
                        ဖိုင်ရွေးရန် -
                      </label>
                      <select
                        id="home-job-select"
                        value={activeJob.id}
                        onChange={(e) => setSelectedJobId(e.target.value)}
                        className="max-w-[220px] sm:max-w-xs truncate bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                      >
                        {jobs.map((j) => (
                          <option key={j.id} value={j.id}>
                            {j.fileName} ({j.segments.length} ကြောင်း)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Video Monitor + Live Silence-Aware Burmese Overlay + Interactive Zoomable Waveform */}
                  <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
                    <div className="relative aspect-video max-h-[360px] w-full bg-slate-950 flex items-center justify-center overflow-hidden">
                      {activeJob.mediaUrl ? (
                        <video
                          ref={videoRef}
                          src={activeJob.mediaUrl}
                          className="w-full h-full object-contain bg-black"
                          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                          onEnded={() => setIsPlaying(false)}
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-6 pb-16 text-center select-none">
                          <div className="text-xs font-mono text-slate-400 mb-2 truncate max-w-full px-2">
                            {activeJob.fileName}
                          </div>
                          <p className="text-xs text-slate-400 font-mono tabular-nums">
                            အချိန်မှတ်တမ်း {formatSrtTimestamp(currentTime)} /{' '}
                            {formatSrtTimestamp(duration)}
                          </p>
                        </div>
                      )}

                      {/* Top-Right Speech-Only Live Synchronization Indicator */}
                      <div
                        data-testid="speech-sync-status-badge"
                        className="absolute top-3 right-3 px-2.5 py-1 rounded bg-black/80 border border-slate-800 text-[11px] flex items-center gap-1.5 pointer-events-none"
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            activeSegment ? 'bg-emerald-400' : 'bg-slate-500'
                          }`}
                        />
                        <span className="text-slate-200 font-medium">
                          {activeSegment
                            ? `SPEECH ACTIVE · စကားပြောနေချိန် (#${activeSegment.index})`
                            : 'NO SPEECH = NO SUBTITLE · အသံတိတ်ချိန် (စာတန်းထိုး မပြပါ)'}
                        </span>
                      </div>

                      {/* Quick-Test Speech vs Silence Verification Buttons (Top-Left) */}
                      <div className="absolute top-3 left-3 flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const firstSeg = activeJob.segments[0];
                            if (firstSeg) seekTo(firstSeg.startTime + 0.15);
                          }}
                          className="px-2 py-1 rounded bg-black/75 hover:bg-slate-900 border border-emerald-700/60 text-[11px] text-emerald-300 font-medium cursor-pointer"
                        >
                          စကားပြောချိန် စမ်းကြည့်ရန်
                        </button>
                        {activeJob.silenceIntervals && activeJob.silenceIntervals.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const gapSil =
                                activeJob.silenceIntervals?.find(
                                  (s) => s.duration >= 0.5 && s.start > 0.3
                                ) || activeJob.silenceIntervals?.[0];
                              if (gapSil) {
                                seekTo(Number(((gapSil.start + gapSil.end) / 2).toFixed(2)));
                              }
                            }}
                            className="px-2 py-1 rounded bg-black/75 hover:bg-slate-900 border border-slate-700 text-[11px] text-slate-300 font-medium cursor-pointer"
                          >
                            အသံတိတ်ချိန် စမ်းကြည့်ရန်
                          </button>
                        )}
                      </div>

                      {/* Measured Scrim & Live Synchronized Burmese Subtitle Overlay */}
                      <div className="absolute inset-x-0 bottom-0 pt-10 pb-4 px-4 bg-gradient-to-t from-black/90 via-black/55 to-transparent flex flex-col items-center justify-end text-center pointer-events-none min-h-[84px]">
                        {activeSegment ? (
                          <div className="space-y-1 max-w-full">
                            <p
                              data-testid="live-burmese-subtitle"
                              style={{
                                color: subStyle.textColor,
                                backgroundColor: `rgba(0, 0, 0, ${
                                  (subStyle.bgOpacity ?? 65) / 100
                                })`,
                              }}
                              className={`font-myanmar ${liveFontSizeClass} font-semibold drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] whitespace-pre-line px-3.5 py-1 rounded`}
                            >
                              {activeSegment.speaker ? `[${activeSegment.speaker}] ` : ''}
                              {activeSegment.translatedText}
                            </p>
                            {showOriginalOverlay && activeSegment.originalText && (
                              <p className="text-xs text-slate-300 bg-black/55 px-2.5 py-0.5 rounded">
                                {activeSegment.originalText}
                              </p>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* Interactive Zoomable Audio Waveform & Dual Word/Segment Timeline */}
                    <div className="px-3.5 pt-3 pb-2 bg-slate-950 border-t border-slate-800/80 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                        <div className="flex flex-wrap items-center gap-2">
                          <Activity className="w-3.5 h-3.5 text-amber-400" />
                          <span className="font-semibold text-slate-300">
                            အသံလှိုင်းနှင့် အသံတိတ်ချိန်ပြ Timeline
                          </span>

                          {/* Segment vs Word-Level Timeline Toggle */}
                          <div className="inline-flex items-center p-0.5 rounded bg-slate-900 border border-slate-800">
                            <button
                              type="button"
                              onClick={() => setTimelineGranularity('segment')}
                              className={`px-2 py-0.5 rounded text-[11px] cursor-pointer ${
                                timelineGranularity === 'segment'
                                  ? 'bg-slate-800 text-amber-300 font-semibold'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              စာကြောင်းအလိုက်
                            </button>
                            <button
                              type="button"
                              onClick={() => setTimelineGranularity('word')}
                              className={`px-2 py-0.5 rounded text-[11px] cursor-pointer ${
                                timelineGranularity === 'word'
                                  ? 'bg-slate-800 text-amber-300 font-semibold'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              စကားလုံးအလိုက် (Words)
                            </button>
                          </div>
                        </div>

                        {/* Zoom Controls */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-label="အသံလှိုင်း ချုံ့ကြည့်ရန်"
                            onClick={() => setWaveformZoom((z) => Math.max(1, z - 1))}
                            className="p-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 cursor-pointer"
                          >
                            <ZoomOut className="w-3.5 h-3.5" />
                          </button>
                          <span className="font-mono tabular-nums text-slate-300">
                            {waveformZoom}x
                          </span>
                          <button
                            type="button"
                            aria-label="အသံလှိုင်း ချဲ့ကြည့်ရန်"
                            onClick={() => setWaveformZoom((z) => Math.min(4, z + 1))}
                            className="p-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 cursor-pointer"
                          >
                            <ZoomIn className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Clickable & Zoomable Waveform + Subtitle / Word Track */}
                      <div className="w-full overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/90">
                        <div
                          role="slider"
                          tabIndex={0}
                          aria-label="အသံလှိုင်းနှင့် စာတန်းထိုး Timeline"
                          aria-valuemin={0}
                          aria-valuemax={Math.round(duration)}
                          aria-valuenow={Math.round(currentTime)}
                          style={{ width: `${waveformZoom * 100}%` }}
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const ratio = Math.max(
                              0,
                              Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width))
                            );
                            seekTo(ratio * duration);
                          }}
                          className="relative h-16 min-w-full cursor-pointer select-none flex items-end px-1 pb-5 pt-1 gap-[1px]"
                        >
                          {waveformBars.map((peak, idx) => {
                            const barTime = ((idx + 0.5) / waveformBars.length) * duration;
                            const inSpeechSub = activeJob.segments.some(
                              (s) => barTime >= s.startTime && barTime <= s.endTime
                            );
                            const isPast = barTime <= currentTime;
                            const heightPct = Math.max(10, Math.min(100, Math.round(peak * 92)));
                            return (
                              <div
                                key={idx}
                                style={{ height: `${heightPct}%` }}
                                className={`flex-1 rounded-t-xs transition-colors ${
                                  inSpeechSub
                                    ? isPast
                                      ? 'bg-amber-400'
                                      : 'bg-emerald-500/75'
                                    : 'bg-slate-700/45'
                                }`}
                              />
                            );
                          })}

                          {/* Subtitle or Word-Level Timeline Blocks along bottom edge */}
                          <div className="absolute inset-x-0 bottom-0 h-4 bg-slate-950/90 border-t border-slate-800/80">
                            {timelineGranularity === 'word' && allWordsFlat.length > 0
                              ? allWordsFlat.map((w, wIdx) => {
                                  const leftPct = Math.max(
                                    0,
                                    Math.min(100, (w.start / duration) * 100)
                                  );
                                  const widthPct = Math.max(
                                    0.3,
                                    Math.min(100 - leftPct, ((w.end - w.start) / duration) * 100)
                                  );
                                  const isCurrWord =
                                    currentTime >= w.start && currentTime <= w.end;
                                  return (
                                    <div
                                      key={w.id || `${w.word}-${wIdx}`}
                                      title={`${w.word} (${w.start.toFixed(2)}s -> ${w.end.toFixed(
                                        2
                                      )}s)`}
                                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                                      className={`absolute top-0.5 bottom-0.5 rounded-xs border text-[9px] font-mono overflow-hidden px-0.5 ${
                                        isCurrWord
                                          ? 'bg-amber-400 text-slate-950 border-amber-200 font-bold'
                                          : 'bg-sky-500/40 text-sky-100 border-sky-400/50'
                                      }`}
                                    >
                                      {waveformZoom >= 2 ? w.word : ''}
                                    </div>
                                  );
                                })
                              : activeJob.segments.map((seg) => {
                                  const leftPct = Math.max(
                                    0,
                                    Math.min(100, (seg.startTime / duration) * 100)
                                  );
                                  const widthPct = Math.max(
                                    0.8,
                                    Math.min(
                                      100 - leftPct,
                                      ((seg.endTime - seg.startTime) / duration) * 100
                                    )
                                  );
                                  const isCurr = activeSegment?.id === seg.id;
                                  const needsReview =
                                    seg.verificationLabel === 'needs_review' ||
                                    seg.verificationLabel === 'unresolved';
                                  return (
                                    <div
                                      key={seg.id}
                                      title={`#${seg.index}: ${formatDisplayTimecode(
                                        seg.startTime
                                      )} -> ${formatDisplayTimecode(seg.endTime)}`}
                                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                                      className={`absolute top-0.5 bottom-0.5 rounded-xs border ${
                                        isCurr
                                          ? 'bg-amber-400 border-amber-200'
                                          : needsReview
                                          ? 'bg-amber-500/50 border-amber-400'
                                          : 'bg-emerald-500/45 border-emerald-400/50'
                                      }`}
                                    />
                                  );
                                })}
                          </div>

                          {/* Playhead Needle */}
                          <div
                            style={{
                              left: `${Math.max(
                                0,
                                Math.min(100, (currentTime / duration) * 100)
                              )}%`,
                            }}
                            className="absolute top-0 bottom-0 w-0.5 bg-rose-400 pointer-events-none"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Playback, Frame-by-Frame Navigation, Speed Controls & Scrubber Bar */}
                    <div className="p-3.5 bg-slate-900/90 border-t border-slate-800 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={togglePlay}
                            className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            {isPlaying ? (
                              <>
                                <Pause className="w-3.5 h-3.5" />
                                <span>ရပ်ရန်</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5" />
                                <span>ဖွင့်ကြည့်ရန်</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => seekTo(0)}
                            aria-label="အစသို့ ပြန်သွားရန်"
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg cursor-pointer"
                          >
                            <SkipBack className="w-3.5 h-3.5" />
                          </button>

                          {/* Frame-by-Frame Navigation Controls */}
                          <button
                            type="button"
                            onClick={() => stepFrame(-1)}
                            aria-label="ရှေ့တစ်ဖရိမ် (-1 Frame)"
                            title="ရှေ့တစ်ဖရိမ် (-1 Frame)"
                            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono rounded-lg inline-flex items-center gap-0.5 cursor-pointer"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                            <span>-1F</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => stepFrame(1)}
                            aria-label="နောက်တစ်ဖရိမ် (+1 Frame)"
                            title="နောက်တစ်ဖရိမ် (+1 Frame)"
                            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono rounded-lg inline-flex items-center gap-0.5 cursor-pointer"
                          >
                            <span>+1F</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>

                          {/* Playback Speed Control (Section 7) */}
                          <div className="inline-flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs">
                            <Gauge className="w-3.5 h-3.5 text-amber-400" />
                            <label htmlFor="playback-speed-select" className="sr-only">
                              အမြန်နှုန်း
                            </label>
                            <select
                              id="playback-speed-select"
                              aria-label="ဗီဒီယို အမြန်နှုန်း"
                              value={playbackRate}
                              onChange={(e) => setPlaybackRate(Number(e.target.value))}
                              className="bg-transparent text-slate-100 font-mono text-xs focus:outline-none cursor-pointer"
                            >
                              {PLAYBACK_SPEEDS.map((spd) => (
                                <option key={spd} value={spd} className="bg-slate-900">
                                  {spd}x
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="font-mono tabular-nums text-xs text-slate-200">
                          {formatSrtTimestamp(currentTime)}{' '}
                          <span className="text-slate-500">/ {formatSrtTimestamp(duration)}</span>
                        </div>

                        <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showOriginalOverlay}
                            onChange={(e) => setShowOriginalOverlay(e.target.checked)}
                            className="rounded border-slate-700 bg-slate-950 text-amber-500"
                          />
                          <span>မူရင်းစာသားပါ တွဲပြရန်</span>
                        </label>
                      </div>

                      <input
                        type="range"
                        aria-label="ဗီဒီယို အချိန်ရွှေ့ရန်"
                        min={0}
                        max={duration}
                        step={0.02}
                        value={currentTime}
                        onChange={(e) => seekTo(Number(e.target.value))}
                        className="w-full accent-amber-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Quick Editor Helper Toolbar + Undo / Redo + Style Customization */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Undo / Redo Buttons */}
                      <button
                        type="button"
                        disabled={!canUndo}
                        onClick={handleUndo}
                        aria-label="နောက်သို့ပြန်ရန် (Undo)"
                        title="နောက်သို့ပြန်ရန် (Undo)"
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs rounded-lg inline-flex items-center gap-1 cursor-pointer disabled:opacity-40"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        <span>Undo</span>
                      </button>
                      <button
                        type="button"
                        disabled={!canRedo}
                        onClick={handleRedo}
                        aria-label="ရှေ့သို့ပြန်ရန် (Redo)"
                        title="ရှေ့သို့ပြန်ရန် (Redo)"
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs rounded-lg inline-flex items-center gap-1 cursor-pointer disabled:opacity-40"
                      >
                        <Redo2 className="w-3.5 h-3.5" />
                        <span>Redo</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowSearchTools((v) => !v)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Search className="w-3.5 h-3.5 text-amber-400" />
                        <span>စာသား ရှာဖွေအစားထိုးရန်</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowStylePanel((v) => !v)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Palette className="w-3.5 h-3.5 text-sky-400" />
                        <span>စာတန်းထိုး ဒီဇိုင်း (Style)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowQcPanel((v) => !v)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
                        <span>
                          အရည်အသွေး စစ်ဆေးချက် (QC ·{' '}
                          {totalQcIssues === 0 ? 'အားလုံးကောင်းမွန်သည်' : `${totalQcIssues} ချက်`})
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={isRefining}
                        onClick={() => void handleHighThinkingRefine()}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs rounded-lg inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isRefining ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        <span>Gemini ဖြင့် မြန်မာစာသား ပိုချောမွေ့အောင်ညှိရန်</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAddSegmentAfter(activeJob.segments.length - 1)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs rounded-lg inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 text-amber-400" />
                      <span>စာကြောင်းအသစ် ထည့်ရန်</span>
                    </button>
                  </div>

                  {refineFeedback && (
                    <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 break-words">
                      {refineFeedback}
                    </p>
                  )}

                  {/* Collapsible Subtitle Style Customization Panel (Section 9) */}
                  {showStylePanel && (
                    <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-xs font-bold text-slate-100">
                          စာတန်းထိုး စာလုံးအရွယ်အစား၊ အရောင်နှင့် နောက်ခံ ဒီဇိုင်း (Preview &amp; ASS Export Style)
                        </h3>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                        <div className="space-y-1">
                          <label className="block text-slate-400">စာလုံး အရွယ်အစား</label>
                          <select
                            value={subStyle.fontSize}
                            onChange={(e) =>
                              handleUpdateSubtitleStyle({
                                fontSize: e.target.value as SubtitleStyleSettings['fontSize'],
                              })
                            }
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                          >
                            <option value="sm">အသေး (Small)</option>
                            <option value="md">အလတ် (Medium · Default)</option>
                            <option value="lg">အကြီး (Large)</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-slate-400">စာသား အရောင်</label>
                          <select
                            value={subStyle.textColor}
                            onChange={(e) =>
                              handleUpdateSubtitleStyle({
                                textColor: e.target.value as SubtitleStyleSettings['textColor'],
                              })
                            }
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                          >
                            <option value="#FEF3C7">ရွှေဝါရောင်နု (Warm Cream)</option>
                            <option value="#FFFFFF">အဖြူရောင် (Pure White)</option>
                            <option value="#A7F3D0">မြစိမ်းရောင်နု (Soft Mint)</option>
                            <option value="#BAE6FD">မိုးပြာရောင်နု (Sky Blue)</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-slate-400">နောက်ခံ အမည်းရောင် ပွင့်လင်းမှု</label>
                          <select
                            value={subStyle.bgOpacity}
                            onChange={(e) =>
                              handleUpdateSubtitleStyle({
                                bgOpacity: Number(e.target.value),
                              })
                            }
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                          >
                            <option value={0}>0% (နောက်ခံ မပါ)</option>
                            <option value={45}>45% (အပါး)</option>
                            <option value={65}>65% (စံချိန်မီ · Default)</option>
                            <option value={85}>85% (အထူ)</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-slate-400">ASS Export ဘောင်ပုံစံ</label>
                          <select
                            value={subStyle.outlineStyle}
                            onChange={(e) =>
                              handleUpdateSubtitleStyle({
                                outlineStyle: e.target.value as SubtitleStyleSettings['outlineStyle'],
                              })
                            }
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                          >
                            <option value="outline">စာလုံးဘောင်ကွပ် (Outline + Drop Shadow)</option>
                            <option value="box">နောက်ခံလေးထောင့်ကွက် (Opaque Box)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Collapsible Timestamp & Translation Quality Control (QC) & Final QA Report Panel */}
                  {showQcPanel && (
                    <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-xs font-bold text-slate-100">
                          Final QA အစီရင်ခံစာနှင့် အချိန်/ဘာသာပြန် စစ်ဆေးချက် (Timestamp &amp; Translation QC)
                        </h3>
                        <span className="text-[11px] text-slate-400">
                          မူရင်းအချိန်ကို အလိုအလျောက် မပြောင်းလဲဘဲ သင့်သဘောတူညီချက်ဖြင့်သာ ပြင်ဆင်ပေးပါသည်။
                        </span>
                      </div>

                      {/* Final QA Summary Metrics */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs font-mono tabular-nums">
                        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                          <span className="text-slate-400 block text-[11px]">Verified</span>
                          <span className="text-emerald-300 font-bold">
                            {finalQaReport.verifiedSegments} / {finalQaReport.totalSegments}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                          <span className="text-slate-400 block text-[11px]">High Confidence</span>
                          <span className="text-sky-300 font-bold">
                            {finalQaReport.highConfidenceSegments}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                          <span className="text-slate-400 block text-[11px]">Needs Review</span>
                          <span className="text-amber-300 font-bold">
                            {finalQaReport.segmentsNeedingReview}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                          <span className="text-slate-400 block text-[11px]">Unresolved</span>
                          <span className="text-rose-300 font-bold">
                            {finalQaReport.unresolvedTimingIssues}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                          <span className="text-slate-400 block text-[11px]">Silence Violations</span>
                          <span className="text-emerald-300 font-bold">
                            {finalQaReport.detectedSilenceViolations ?? 0}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                          <span className="text-slate-400 block text-[11px]">Export Validation</span>
                          <span className="text-emerald-300 font-bold">
                            {finalQaReport.exportValidationPassed ? 'PASSED' : 'CHECK'}
                          </span>
                        </div>
                      </div>

                      {totalQcIssues === 0 ? (
                        <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/60 text-xs text-emerald-200 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>
                            အချိန်မှတ်တမ်းထပ်နေခြင်း၊ အသံတိတ်ချိန်အတွင်း စာတန်းထိုးကျန်နေခြင်းနှင့် ဘာသာပြန်အမှားအယွင်း မတွေ့ရှိပါ။
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-56 overflow-y-auto">
                          {timingIssues.map((issue) => (
                            <div
                              key={issue.id}
                              className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs"
                            >
                              <span className="text-amber-200 break-words">{issue.message}</span>
                              {(issue.suggestedStartTime !== undefined ||
                                issue.suggestedEndTime !== undefined) && (
                                <button
                                  type="button"
                                  onClick={() => handleApproveTimingFix(issue)}
                                  className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded text-xs cursor-pointer shrink-0"
                                >
                                  အကြံပြုချိန် လက်ခံပြင်ဆင်ရန်
                                </button>
                              )}
                            </div>
                          ))}
                          {translationIssues.map((issue) => (
                            <div
                              key={issue.id}
                              className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs"
                            >
                              <span className="text-amber-200 break-words">{issue.message}</span>
                              {issue.suggestedText && (
                                <button
                                  type="button"
                                  onClick={() => handleApproveTranslationFix(issue)}
                                  className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded text-xs cursor-pointer shrink-0"
                                >
                                  အကြံပြုစာသား လက်ခံပြင်ဆင်ရန်
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Collapsible Search & Replace Box */}
                  {showSearchTools && (
                    <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <input
                          type="text"
                          placeholder="ရှာလိုသော စကားလုံး (ဥပမာ - ဦးသန့်ဇင်)"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100"
                        />
                        <input
                          type="text"
                          placeholder="အစားထိုးလိုသော စကားလုံး..."
                          value={replaceText}
                          onChange={(e) => setReplaceText(e.target.value)}
                          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-400">
                          {replaceFeedback ||
                            'နာမည်များနှင့် အသုံးအနှုန်းများကို တစ်ပြေးညီ အစားထိုးနိုင်ပါသည်။'}
                        </span>
                        <button
                          type="button"
                          onClick={handleSearchAndReplace}
                          className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Replace className="w-3.5 h-3.5" />
                          <span>အားလုံး အစားထိုးရန်</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Editable Subtitle Segments List with Speaker Label, Verification Labels & Before/After History */}
                  <div className="space-y-3 max-h-[580px] overflow-y-auto pr-1">
                    {activeJob.segments.map((seg, idx) => {
                      const isCurrent = activeSegment?.id === seg.id;
                      const startDraftKey = `${seg.id}_startTime`;
                      const endDraftKey = `${seg.id}_endTime`;
                      const badge = renderVerificationBadge(seg.verificationLabel);
                      const isHistoryOpen = expandedHistorySegId === seg.id;

                      return (
                        <div
                          id={`seg-card-${seg.id}`}
                          key={seg.id}
                          className={`p-3.5 rounded-xl border transition-colors ${
                            isCurrent
                              ? 'bg-amber-500/10 border-amber-500/50'
                              : 'bg-slate-950/60 border-slate-800/90 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-800/80">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => seekTo(seg.startTime + 0.05)}
                                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-400 font-mono tabular-nums text-xs font-semibold cursor-pointer"
                              >
                                #{String(seg.index).padStart(2, '0')}
                              </button>

                              <input
                                type="text"
                                aria-label={`စာကြောင်း ${seg.index} စတင်ချိန်`}
                                value={
                                  timeDrafts[startDraftKey] !== undefined
                                    ? timeDrafts[startDraftKey]
                                    : formatSrtTimestamp(seg.startTime)
                                }
                                onChange={(e) =>
                                  setTimeDrafts((prev) => ({
                                    ...prev,
                                    [startDraftKey]: e.target.value,
                                  }))
                                }
                                onBlur={(e) =>
                                  handleTimestampBlur(seg.id, 'startTime', e.target.value)
                                }
                                className="w-28 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs font-mono tabular-nums text-slate-200"
                              />

                              <span className="text-slate-500 font-mono text-xs">--&gt;</span>

                              <input
                                type="text"
                                aria-label={`စာကြောင်း ${seg.index} ပြီးဆုံးချိန်`}
                                value={
                                  timeDrafts[endDraftKey] !== undefined
                                    ? timeDrafts[endDraftKey]
                                    : formatSrtTimestamp(seg.endTime)
                                }
                                onChange={(e) =>
                                  setTimeDrafts((prev) => ({
                                    ...prev,
                                    [endDraftKey]: e.target.value,
                                  }))
                                }
                                onBlur={(e) =>
                                  handleTimestampBlur(seg.id, 'endTime', e.target.value)
                                }
                                className="w-28 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs font-mono tabular-nums text-slate-200"
                              />

                              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                                ({(seg.endTime - seg.startTime).toFixed(2)}s)
                              </span>

                              {/* Editable Speaker Label (Section 7) */}
                              <div className="inline-flex items-center gap-1 bg-slate-900 border border-slate-800 rounded px-2 py-0.5">
                                <User className="w-3 h-3 text-slate-400 shrink-0" />
                                <input
                                  type="text"
                                  aria-label={`စာကြောင်း ${seg.index} ပြောဆိုသူ`}
                                  placeholder="ပြောဆိုသူ (Speaker)"
                                  value={seg.speaker || ''}
                                  onChange={(e) =>
                                    handleSegmentTextChange(seg.id, 'speaker', e.target.value)
                                  }
                                  className="w-24 bg-transparent text-[11px] text-slate-200 focus:outline-none"
                                />
                              </div>

                              {/* Explicit Verification Status Text */}
                              <span
                                className={`text-[11px] px-2 py-0.5 rounded border ${badge.cls}`}
                              >
                                {badge.text}
                              </span>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedHistorySegId(isHistoryOpen ? null : seg.id)
                                }
                                title="မူရင်းအချိန်နှင့် ပြင်ဆင်မှုမှတ်တမ်း နှိုင်းယှဉ်ကြည့်ရန် (Before/After & History)"
                                aria-label={`စာကြောင်း ${seg.index} အချိန်မှတ်တမ်း ရာဇဝင်ကြည့်ရန်`}
                                className={`p-1.5 rounded cursor-pointer ${
                                  isHistoryOpen
                                    ? 'bg-amber-500/20 text-amber-300'
                                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                                }`}
                              >
                                <History className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSplitSegment(seg.id)}
                                title="စာကြောင်း နှစ်ပိုင်းခွဲရန် (Split)"
                                aria-label={`စာကြောင်း ${seg.index} နှစ်ပိုင်းခွဲရန်`}
                                className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded cursor-pointer"
                              >
                                <Scissors className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={idx >= activeJob.segments.length - 1}
                                onClick={() => handleMergeSegmentWithNext(seg.id)}
                                title="အောက်စာကြောင်းနှင့် ပေါင်းစည်းရန် (Merge)"
                                aria-label={`စာကြောင်း ${seg.index} ပေါင်းစည်းရန်`}
                                className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded disabled:opacity-30 cursor-pointer"
                              >
                                <Merge className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAddSegmentAfter(idx)}
                                title="အောက်တွင် စာကြောင်းအသစ်ထည့်ရန်"
                                aria-label={`စာကြောင်း ${seg.index} အောက်တွင် အသစ်ထည့်ရန်`}
                                className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSegment(seg.id)}
                                disabled={activeJob.segments.length <= 1}
                                title="ဖျက်ရန်"
                                aria-label={`စာကြောင်း ${seg.index} ဖျက်ရန်`}
                                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded disabled:opacity-30 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Expandable Before-and-After Timestamp Comparison, Phoneme Words & Correction History */}
                          {isHistoryOpen && (
                            <div className="mb-3 p-3 rounded-lg bg-slate-900/90 border border-slate-800 text-xs space-y-2">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono tabular-nums text-[11px]">
                                <div>
                                  <span className="text-slate-400 block">
                                    မူရင်း ASR အချိန် (Immutable Original):
                                  </span>
                                  <span className="text-slate-200">
                                    {formatSrtTimestamp(seg.originalStartTime ?? seg.startTime)}{' '}
                                    --&gt;{' '}
                                    {formatSrtTimestamp(seg.originalEndTime ?? seg.endTime)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-400 block">
                                    Phoneme / VAD Verified အချိန်:
                                  </span>
                                  <span className="text-emerald-300">
                                    {formatSrtTimestamp(seg.verifiedStartTime ?? seg.startTime)}{' '}
                                    --&gt;{' '}
                                    {formatSrtTimestamp(seg.verifiedEndTime ?? seg.endTime)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-400 block">Alignment စနစ်:</span>
                                  <span className="text-amber-300">
                                    {seg.alignmentSource || 'phoneme_forced_align'}
                                  </span>
                                </div>
                              </div>

                              {seg.words && seg.words.length > 0 && (
                                <div className="pt-1.5 border-t border-slate-800">
                                  <span className="text-[11px] text-slate-400 block mb-1">
                                    စကားလုံးနှင့် Phoneme အချိန်မှတ်တမ်းများ (နှိပ်၍ နားထောင်နိုင်သည်):
                                  </span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {seg.words.map((w, wIdx) => (
                                      <button
                                        key={w.id || wIdx}
                                        type="button"
                                        onClick={() => seekTo(w.start)}
                                        className="px-2 py-0.5 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] font-mono tabular-nums text-slate-200 cursor-pointer"
                                      >
                                        <span>{w.word}</span>{' '}
                                        <span className="text-slate-400">
                                          ({w.start.toFixed(2)}s–{w.end.toFixed(2)}s)
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {seg.correctionHistory && seg.correctionHistory.length > 0 && (
                                <div className="pt-1.5 border-t border-slate-800 space-y-1">
                                  <span className="text-[11px] text-slate-400 block">
                                    အချိန်မှတ်တမ်း ပြင်ဆင်မှု ရာဇဝင် (Correction History):
                                  </span>
                                  {seg.correctionHistory.map((h, hIdx) => (
                                    <div
                                      key={hIdx}
                                      className="text-[11px] font-mono tabular-nums text-slate-300"
                                    >
                                      [{h.stage}] {h.previousStart.toFixed(3)}s–
                                      {h.previousEnd.toFixed(3)}s → {h.newStart.toFixed(3)}s–
                                      {h.newEnd.toFixed(3)}s ({h.reason})
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          <div className="space-y-2">
                            <div>
                              <label
                                htmlFor={`burmese-seg-${seg.id}`}
                                className="block text-[11px] text-amber-400/90 mb-1"
                              >
                                မြန်မာဘာသာပြန် စာတန်းထိုး (Translation Layer — ပြင်ဆင်ပါက မူရင်းအချိန် မပြောင်းလဲပါ)
                              </label>
                              <textarea
                                id={`burmese-seg-${seg.id}`}
                                rows={2}
                                placeholder="မြန်မာဘာသာပြန် စာတန်းထိုး ရေးသားပါ..."
                                value={seg.translatedText}
                                onChange={(e) =>
                                  handleSegmentTextChange(
                                    seg.id,
                                    'translatedText',
                                    e.target.value
                                  )
                                }
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 font-myanmar focus:outline-none focus:border-amber-500"
                              />
                            </div>

                            <div>
                              <label
                                htmlFor={`orig-seg-${seg.id}`}
                                className="block text-[11px] text-slate-400 mb-1"
                              >
                                မူရင်းစာသား ({activeJob.detectedLanguage})
                              </label>
                              <input
                                id={`orig-seg-${seg.id}`}
                                type="text"
                                placeholder="မူရင်းဘာသာစကား စာသား..."
                                value={seg.originalText}
                                onChange={(e) =>
                                  handleSegmentTextChange(seg.id, 'originalText', e.target.value)
                                }
                                className="w-full bg-slate-900/50 border border-slate-800/80 rounded-lg px-3 py-1.5 text-xs text-slate-300"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* STEP 6: DOWNLOAD SRT / VTT / ASS SUBTITLE FILES */}
                <section className="p-5 sm:p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-base sm:text-lg font-bold text-slate-100">
                        စာတန်းထိုးဖိုင် ဒေါင်းလုဒ်လုပ်ရန် (SRT / VTT / ASS Export)
                      </h2>
                      <p className="text-xs text-slate-400">
                        UTF-8 မြန်မာယူနီကုဒ် စံချိန်စံညွှန်းဖြင့် SRT, WebVTT (.vtt) နှင့် SubStation Alpha (.ass) ဖိုင်အမျိုးအစားများကို ဒေါင်းလုဒ်လုပ်နိုင်ပါသည်။
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleExportSubtitle(activeJob, 'srt', 'translated')}
                        className="px-5 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm rounded-xl transition-colors inline-flex items-center gap-2 cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        <span>SRT ဒေါင်းလုဒ်လုပ်ရန် (မြန်မာ .SRT)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExportSubtitle(activeJob, 'vtt', 'translated')}
                        className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-medium rounded-xl transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-400" />
                        <span>WebVTT (.VTT)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExportSubtitle(activeJob, 'ass', 'translated')}
                        className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-medium rounded-xl transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-amber-400" />
                        <span>SubStation (.ASS)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExportSubtitle(activeJob, 'srt', 'original')}
                        className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-medium rounded-xl transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-slate-400" />
                        <span>မူရင်းဘာသာ .SRT</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExportSubtitle(activeJob, 'srt', 'bilingual')}
                        className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-medium rounded-xl transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-amber-400" />
                        <span>နှစ်ဘာသာတွဲ .SRT</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleCopySrt()}
                        className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium rounded-xl transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        {copiedSrt ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>ကူးယူပြီးပါပြီ</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-slate-400" />
                            <span>SRT စာသား ကူးယူရန်</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </section>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
