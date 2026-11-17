import React, { useState, useRef } from 'react';
import {
  Upload,
  FileAudio,
  FileVideo,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Play,
  RotateCcw,
  ArrowRight,
  Sparkles,
  FileText,
} from 'lucide-react';
import { AppSettings, ProcessingJob } from '../types/subtitle';
import { formatDisplayTimecode, parseSrtContent } from '../utils/subtitleUtils';
import { DEFAULT_PIPELINE_STAGES } from '../utils/demoData';

interface GeneratorViewProps {
  settings: AppSettings;
  onUpdateSettings: (partial: Partial<AppSettings>) => void;
  activeJob: ProcessingJob | null;
  onStartUploadJob: (file: File) => Promise<void>;
  onRunSamplePipeline: () => Promise<void>;
  onRetryJob: (jobId: string) => Promise<void>;
  onImportSrtJob: (job: ProcessingJob) => void;
  onOpenInEditor: (jobId: string) => void;
  uploadProgress: number;
  isUploading: boolean;
  uploadError: string | null;
}

const ALLOWED_EXTS = ['.mp4', '.mkv', '.mov', '.mp3', '.wav', '.m4a'];

export const GeneratorView: React.FC<GeneratorViewProps> = ({
  settings,
  onUpdateSettings,
  activeJob,
  onStartUploadJob,
  onRunSamplePipeline,
  onRetryJob,
  onImportSrtJob,
  onOpenInEditor,
  uploadProgress,
  isUploading,
  uploadError,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [probedDuration, setProbedDuration] = useState<number | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const srtInputRef = useRef<HTMLInputElement | null>(null);

  const validateAndSelectFile = (file: File) => {
    setValidationError(null);
    setProbedDuration(null);

    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      setValidationError(
        `Unsupported format "${ext}". Please upload MP4, MKV, MOV, MP3, WAV, or M4A.`
      );
      setSelectedFile(null);
      return;
    }

    const maxBytes = settings.maxUploadSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      setValidationError(
        `File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the configured ${
          settings.maxUploadSizeMb
        } MB limit.`
      );
      setSelectedFile(null);
      return;
    }

    if (file.size === 0) {
      setValidationError('The selected media file is empty (0 bytes).');
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);

    // Probe duration in browser using HTMLMediaElement
    const objectUrl = URL.createObjectURL(file);
    const mediaEl = document.createElement(
      ext === '.mp3' || ext === '.wav' || ext === '.m4a' ? 'audio' : 'video'
    );
    mediaEl.preload = 'metadata';
    mediaEl.onloadedmetadata = () => {
      if (Number.isFinite(mediaEl.duration) && mediaEl.duration > 0) {
        setProbedDuration(Number(mediaEl.duration.toFixed(2)));
      }
      URL.revokeObjectURL(objectUrl);
    };
    mediaEl.onerror = () => {
      URL.revokeObjectURL(objectUrl);
    };
    mediaEl.src = objectUrl;
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndSelectFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSelectFile(file);
    }
  };

  const handleSrtImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsedSegments = parseSrtContent(text);
    if (parsedSegments.length === 0) {
      setValidationError('Could not parse any valid subtitle blocks from the selected .SRT file.');
      return;
    }
    const maxEnd = parsedSegments.reduce((m, s) => Math.max(m, s.endTime), 10);
    const importedJob: ProcessingJob = {
      id: `job-srt-${Date.now().toString().slice(-6)}`,
      fileName: file.name,
      fileSize: file.size,
      durationSeconds: maxEnd,
      format: 'SRT Subtitle Import',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: 'completed',
      currentStage: 'ready',
      progress: 100,
      detectedLanguage: 'Imported',
      detectedLanguageCode: 'srt',
      thinkingMode: settings.thinkingMode,
      modelUsed: 'Imported SRT',
      translationStyle: settings.translationStyle,
      segments: parsedSegments,
      stages: DEFAULT_PIPELINE_STAGES.map((s) => ({ ...s, status: 'completed', durationMs: 10 })),
    };
    onImportSrtJob(importedJob);
  };

  const stagesToDisplay = activeJob ? activeJob.stages : DEFAULT_PIPELINE_STAGES;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">AI Subtitle Generator &amp; Pipeline</h1>
          <p className="text-sm text-slate-400">
            Upload video or audio to extract speech via FFmpeg, detect language, and translate into
            synchronized Burmese Unicode.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            ref={srtInputRef}
            type="file"
            accept=".srt"
            onChange={handleSrtImport}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => srtInputRef.current?.click()}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            <span>Import Existing .SRT</span>
          </button>

          <button
            type="button"
            onClick={() => void onRunSamplePipeline()}
            disabled={isUploading || activeJob?.status === 'processing'}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Synthesize &amp; Run Live FFmpeg Sample</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 7 Columns: Upload & Localization Parameters */}
        <div className="lg:col-span-7 space-y-6">
          {/* Drag and Drop Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              isDragging
                ? 'border-amber-400 bg-amber-500/5'
                : 'border-slate-700/80 hover:border-slate-600 bg-slate-900/40'
            }`}
          >
            <input
              ref={fileInputRef}
              id="media-upload-input"
              type="file"
              accept=".mp4,.mkv,.mov,.mp3,.wav,.m4a"
              onChange={handleFileChange}
              className="hidden"
            />

            <div className="mx-auto w-12 h-12 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-center mb-4">
              <Upload className="w-6 h-6 text-amber-400" />
            </div>

            <h2 className="text-base font-semibold text-slate-100">
              Drag and drop video or audio file here
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Supports MP4, MKV, MOV, MP3, WAV, and M4A · Max {settings.maxUploadSizeMb} MB
            </p>

            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Select Media File
              </button>
            </div>
          </div>

          {/* Validation or Upload Error */}
          {(validationError || uploadError) && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/70 text-rose-200 text-xs flex items-start gap-3"
            >
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-rose-300">File Validation / Upload Error</p>
                <p>{validationError || uploadError}</p>
              </div>
            </div>
          )}

          {/* Selected File Inspector */}
          {selectedFile && (
            <div className="p-5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {selectedFile.name.match(/\.(mp3|wav|m4a)$/i) ? (
                    <FileAudio className="w-8 h-8 text-amber-400 shrink-0" />
                  ) : (
                    <FileVideo className="w-8 h-8 text-amber-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-100 truncate">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-slate-400 font-mono tabular-nums">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                      {probedDuration !== null
                        ? ` · Duration ${formatDisplayTimecode(probedDuration)}`
                        : ' · Probing stream duration on server'}
                      {' · '}
                      {(selectedFile.name.split('.').pop() || '').toUpperCase()}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    setProbedDuration(null);
                  }}
                  className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  Clear
                </button>
              </div>

              {isUploading && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-mono tabular-nums text-slate-300">
                    <span>Uploading media stream...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 transition-all duration-150"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={isUploading || activeJob?.status === 'processing'}
                  onClick={() => void onStartUploadJob(selectedFile)}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Uploading &amp; Starting Pipeline...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      <span>Start Auto-Subtitle &amp; Burmese Translation</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Localization & High-Thinking Options */}
          <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800 space-y-5">
            <h3 className="text-sm font-semibold text-slate-100">
              Myanmar Translation &amp; AI Reasoning Settings
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="gen-style-select"
                  className="block text-xs font-medium text-slate-300"
                >
                  Burmese Register &amp; Tone
                </label>
                <select
                  id="gen-style-select"
                  value={settings.translationStyle}
                  onChange={(e) =>
                    onUpdateSettings({
                      translationStyle: e.target.value as AppSettings['translationStyle'],
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="conversational">
                    Conversational Burmese (စကားပြောဟန်)
                  </option>
                  <option value="cinema">Cinema &amp; Drama (ရုပ်ရှင်ဟန်)</option>
                  <option value="documentary">
                    Documentary Narration (မှတ်တမ်းဟန်)
                  </option>
                  <option value="formal">Formal Broadcast (စာပေဟန်)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="gen-max-chars"
                  className="block text-xs font-medium text-slate-300"
                >
                  Max Characters Per Line (Max 2 Lines)
                </label>
                <input
                  id="gen-max-chars"
                  type="number"
                  min={24}
                  max={65}
                  value={settings.maxCharsPerLine}
                  onChange={(e) =>
                    onUpdateSettings({ maxCharsPerLine: Number(e.target.value) || 42 })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono tabular-nums focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Gemini High Thinking Mode (gemini-4-carbon · ThinkingLevel.HIGH)</span>
                </div>
                <p className="text-xs text-slate-400">
                  Enables deep contextual reasoning to resolve speakers, idioms, and natural
                  Myanmar sentence particles.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={settings.thinkingMode}
                aria-label="Toggle Gemini High Thinking Mode"
                onClick={() => onUpdateSettings({ thinkingMode: !settings.thinkingMode })}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  settings.thinkingMode ? 'bg-amber-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-slate-950 transition duration-200 ${
                    settings.thinkingMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Right 5 Columns: Live 9-Stage Processing Pipeline */}
        <div className="lg:col-span-5 bg-slate-900/50 border border-slate-800 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Processing Pipeline Status</h2>
              <p className="text-xs text-slate-400">
                {activeJob ? activeJob.fileName : 'Ready for media input'}
              </p>
            </div>
            {activeJob && (
              <span className="text-xs font-mono tabular-nums text-amber-400 font-semibold">
                {activeJob.progress}%
              </span>
            )}
          </div>

          {activeJob && (
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-200 ${
                  activeJob.status === 'failed'
                    ? 'bg-rose-500'
                    : activeJob.status === 'completed'
                    ? 'bg-emerald-500'
                    : 'bg-amber-500'
                }`}
                style={{ width: `${activeJob.progress}%` }}
              />
            </div>
          )}

          {/* Pipeline Stages Checklist */}
          <ol className="space-y-3">
            {stagesToDisplay.map((stage, idx) => {
              const isCompleted = stage.status === 'completed';
              const isRunning = stage.status === 'running';
              const isError = stage.status === 'error';

              return (
                <li
                  key={stage.id}
                  className={`p-3 rounded-lg border text-xs transition-colors ${
                    isRunning
                      ? 'bg-amber-500/10 border-amber-500/40 text-slate-100'
                      : isCompleted
                      ? 'bg-slate-900/70 border-slate-800/90 text-slate-200'
                      : isError
                      ? 'bg-rose-950/30 border-rose-800/70 text-rose-200'
                      : 'bg-slate-950/40 border-slate-800/50 text-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 font-medium">
                      <span className="font-mono tabular-nums text-[11px] text-slate-400">
                        0{idx + 1}.
                      </span>
                      {isCompleted && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      )}
                      {isRunning && (
                        <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
                      )}
                      {isError && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                      <span>{stage.label}</span>
                    </div>

                    {stage.durationMs !== undefined && isCompleted && (
                      <span className="font-mono tabular-nums text-[11px] text-slate-400">
                        {(stage.durationMs / 1000).toFixed(2)}s
                      </span>
                    )}
                  </div>

                  <p className="mt-1 pl-6 text-[11px] text-slate-400">
                    {stage.detail || stage.description}
                  </p>
                </li>
              );
            })}
          </ol>

          {/* Job Failure Retry Banner */}
          {activeJob?.status === 'failed' && (
            <div className="p-4 rounded-lg bg-rose-950/50 border border-rose-800 space-y-3">
              <p className="text-xs text-rose-200 font-medium">
                Pipeline Error: {activeJob.error || 'Processing interrupted.'}
              </p>
              <button
                type="button"
                onClick={() => void onRetryJob(activeJob.id)}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry Processing Task</span>
              </button>
            </div>
          )}

          {/* Completed Action */}
          {activeJob?.status === 'completed' && (
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-3">
              <div className="text-xs text-emerald-400 font-medium">
                {activeJob.segments.length} Burmese segments synchronized
              </div>
              <button
                type="button"
                onClick={() => onOpenInEditor(activeJob.id)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Open in Subtitle Editor</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
