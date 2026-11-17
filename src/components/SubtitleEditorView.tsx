import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Play,
  Pause,
  Plus,
  Trash2,
  Scissors,
  Search,
  Replace,
  Download,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Wand2,
  Loader2,
  SkipBack,
} from 'lucide-react';
import { ProcessingJob, SubtitleSegment } from '../types/subtitle';
import {
  formatSrtTimestamp,
  parseSrtTimestamp,
  formatDisplayTimecode,
  normalizeAndValidateSegments,
  searchAndReplaceSegments,
  splitSubtitleSegment,
  generateSrtContent,
} from '../utils/subtitleUtils';

interface SubtitleEditorViewProps {
  job: ProcessingJob;
  allJobs: ProcessingJob[];
  onSelectJob: (jobId: string) => void;
  onUpdateSegments: (jobId: string, segments: SubtitleSegment[]) => void;
  onExportSrt: (job: ProcessingJob, mode: 'translated' | 'original' | 'bilingual') => void;
}

export const SubtitleEditorView: React.FC<SubtitleEditorViewProps> = ({
  job,
  allJobs,
  onSelectJob,
  onUpdateSegments,
  onExportSrt,
}) => {
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [showOriginalOverlay, setShowOriginalOverlay] = useState<boolean>(true);

  // Search & Replace state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [replaceText, setReplaceText] = useState<string>('');
  const [searchField, setSearchField] = useState<'translated' | 'original' | 'both'>('translated');
  const [replaceFeedback, setReplaceFeedback] = useState<string | null>(null);

  // High Thinking Refinement state
  const [refineInstruction, setRefineInstruction] = useState<string>(
    'Make the Burmese dialogue sound even more natural and conversational while keeping max 2 lines per subtitle.'
  );
  const [isRefining, setIsRefining] = useState<boolean>(false);
  const [refineFeedback, setRefineFeedback] = useState<string | null>(null);

  // SRT Raw Preview / Copy state
  const [srtPreviewMode, setSrtPreviewMode] = useState<'translated' | 'original' | 'bilingual'>(
    'translated'
  );
  const [copiedSrt, setCopiedSrt] = useState<boolean>(false);

  // Local timestamp draft inputs keyed by `${segmentId}_start` or `${segmentId}_end`
  const [timeDrafts, setTimeDrafts] = useState<Record<string, string>>({});

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const duration = Math.max(
    job.durationSeconds || 15,
    job.segments.reduce((m, s) => Math.max(m, s.endTime), 10)
  );

  // Reset playback when switching jobs and position playhead on first segment so subtitle overlay is immediately visible
  useEffect(() => {
    setIsPlaying(false);
    const firstStart = job.segments[0] ? Number((job.segments[0].startTime + 0.1).toFixed(2)) : 0;
    setCurrentTime(firstStart);
    setTimeDrafts({});
    setRefineFeedback(null);
    setReplaceFeedback(null);
  }, [job.id]);

  // Synchronized playback loop for both real HTML5 video/audio and simulated timeline
  useEffect(() => {
    if (!isPlaying) return;

    if (job.mediaUrl && videoRef.current) {
      videoRef.current.play().catch(() => {
        // Fallback to timer if media playback is blocked or audio-only
      });
    }

    const interval = window.setInterval(() => {
      if (job.mediaUrl && videoRef.current && !videoRef.current.paused) {
        setCurrentTime(videoRef.current.currentTime);
        if (videoRef.current.ended) {
          setIsPlaying(false);
        }
      } else {
        setCurrentTime((prev) => {
          if (prev + 0.1 >= duration) {
            setIsPlaying(false);
            return 0;
          }
          return Number((prev + 0.1).toFixed(2));
        });
      }
    }, 100);

    return () => window.clearInterval(interval);
  }, [isPlaying, duration, job.mediaUrl]);

  const togglePlay = () => {
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
    const clamped = Math.max(0, Math.min(duration, Number(timeSec.toFixed(2))));
    setCurrentTime(clamped);
    if (videoRef.current) {
      videoRef.current.currentTime = clamped;
    }
  };

  // Active subtitle segment at current playhead
  const activeSegment = useMemo(() => {
    return (
      job.segments.find((s) => currentTime >= s.startTime && currentTime <= s.endTime) || null
    );
  }, [job.segments, currentTime]);

  // Timing validation issues
  const timingDiagnostics = useMemo(() => {
    return normalizeAndValidateSegments(job.segments);
  }, [job.segments]);

  const handleSegmentTextChange = (
    segId: string,
    field: 'translatedText' | 'originalText',
    value: string
  ) => {
    const next = job.segments.map((s) => (s.id === segId ? { ...s, [field]: value } : s));
    onUpdateSegments(job.id, next);
  };

  const handleTimestampBlur = (segId: string, field: 'startTime' | 'endTime', rawVal: string) => {
    const draftKey = `${segId}_${field}`;
    const parsed = parseSrtTimestamp(rawVal);
    if (parsed !== null) {
      const next = job.segments.map((s) => (s.id === segId ? { ...s, [field]: parsed } : s));
      onUpdateSegments(job.id, next);
    }
    setTimeDrafts((prev) => {
      const copy = { ...prev };
      delete copy[draftKey];
      return copy;
    });
  };

  const handleAddSegmentAfter = (index: number) => {
    const prevSeg = job.segments[index];
    const nextSeg = job.segments[index + 1];
    const startTime = prevSeg ? Number((prevSeg.endTime + 0.1).toFixed(2)) : 0.0;
    const endTime = nextSeg
      ? Math.max(Number((startTime + 2.0).toFixed(2)), Number((nextSeg.startTime - 0.1).toFixed(2)))
      : Number((startTime + 3.0).toFixed(2));

    const newSegment: SubtitleSegment = {
      id: `seg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      index: index + 2,
      startTime,
      endTime: Math.max(startTime + 1.0, endTime),
      originalText: 'New subtitle line',
      translatedText: 'စာတန်းထိုးအသစ် ရေးသားပါ။',
    };

    const updated = [...job.segments];
    updated.splice(index + 1, 0, newSegment);
    onUpdateSegments(
      job.id,
      updated.map((s, idx) => ({ ...s, index: idx + 1 }))
    );
  };

  const handleDeleteSegment = (segId: string) => {
    if (job.segments.length <= 1) return;
    const updated = job.segments
      .filter((s) => s.id !== segId)
      .map((s, idx) => ({ ...s, index: idx + 1 }));
    onUpdateSegments(job.id, updated);
  };

  const handleSplitSegment = (segId: string) => {
    const updated = splitSubtitleSegment(job.segments, segId);
    onUpdateSegments(job.id, updated);
  };

  const handleAutoNormalizeTiming = () => {
    const { normalized } = normalizeAndValidateSegments(job.segments);
    onUpdateSegments(job.id, normalized);
  };

  const handleSearchAndReplace = () => {
    if (!searchQuery.trim()) return;
    const { updatedSegments, replacementsCount } = searchAndReplaceSegments(
      job.segments,
      searchQuery,
      replaceText,
      searchField
    );
    onUpdateSegments(job.id, updatedSegments);
    setReplaceFeedback(
      replacementsCount > 0
        ? `Replaced ${replacementsCount} occurrence${replacementsCount === 1 ? '' : 's'} of "${searchQuery}".`
        : `No occurrences of "${searchQuery}" found.`
    );
  };

  const handleHighThinkingRefine = async () => {
    setIsRefining(true);
    setRefineFeedback(null);
    try {
      const response = await fetch('/api/subtitles/refine-burmese', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segments: job.segments,
          instruction: refineInstruction,
          translationStyle: job.translationStyle,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Refinement request failed');
      }
      if (Array.isArray(data.updatedSegments)) {
        onUpdateSegments(job.id, data.updatedSegments);
        setRefineFeedback(`${data.reasoningSummary} (${data.modelUsed})`);
      }
    } catch (err) {
      setRefineFeedback(
        `Refinement Note: ${err instanceof Error ? err.message : 'Could not contact Gemini API'}`
      );
    } finally {
      setIsRefining(false);
    }
  };

  const srtPreviewText = useMemo(() => {
    return generateSrtContent(job.segments, srtPreviewMode);
  }, [job.segments, srtPreviewMode]);

  const handleCopySrt = async () => {
    await navigator.clipboard.writeText(srtPreviewText);
    setCopiedSrt(true);
    setTimeout(() => setCopiedSrt(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Studio Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <label htmlFor="editor-project-select" className="text-xs font-medium text-slate-400 shrink-0">
            Active Media Project:
          </label>
          <select
            id="editor-project-select"
            value={job.id}
            onChange={(e) => onSelectJob(e.target.value)}
            className="w-full sm:w-auto max-w-full truncate bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-100 focus:outline-none focus:border-amber-500"
          >
            {allJobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.fileName} ({j.segments.length} segments)
              </option>
            ))}
          </select>

          <div className="text-xs text-slate-400 hidden sm:flex items-center gap-2">
            <span>·</span>
            <span>{job.detectedLanguage} &rarr; Myanmar Unicode</span>
            <span>·</span>
            <span className="font-mono tabular-nums">{formatDisplayTimecode(duration)}</span>
          </div>
        </div>

        {/* Export Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onExportSrt(job, 'translated')}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Burmese .SRT</span>
          </button>

          <button
            type="button"
            onClick={() => onExportSrt(job, 'original')}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Export Original .SRT</span>
          </button>

          <button
            type="button"
            onClick={() => onExportSrt(job, 'bilingual')}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>Export Bilingual .SRT</span>
          </button>
        </div>
      </div>

      {/* Main Split NLE Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 5 Columns: Synchronized Video Preview + Timeline + Tools */}
        <div className="lg:col-span-5 space-y-5">
          {/* 16:9 Video Preview Surface with Burmese Subtitle Scrim Overlay */}
          <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
            <div className="relative aspect-video bg-slate-950 flex items-center justify-center overflow-hidden">
              {job.mediaUrl ? (
                <video
                  ref={videoRef}
                  src={job.mediaUrl}
                  className="w-full h-full object-contain bg-black"
                  onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                  onEnded={() => setIsPlaying(false)}
                />
              ) : (
                /* Studio Preview Backdrop for Demo Projects */
                <div className="w-full h-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-6 pb-16 text-center select-none">
                  <div className="text-[11px] font-mono text-slate-500 tracking-wider uppercase mb-1 truncate max-w-full px-2">
                    {job.fileName} · Synchronized Preview Monitor
                  </div>
                  <div className="flex items-end justify-center gap-1 h-12 my-2">
                    {[28, 52, 75, 42, 90, 64, 38, 82, 58, 95, 48, 70, 34, 60, 44].map((h, i) => {
                      const activeBar =
                        isPlaying && Math.floor((currentTime * 10 + i) % 5) === 0;
                      return (
                        <div
                          key={i}
                          className={`w-1.5 rounded-full transition-transform duration-150 ${
                            activeBar ? 'bg-amber-400 scale-y-110' : 'bg-slate-700/70'
                          }`}
                          style={{ height: `${h}%` }}
                        />
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-400 font-mono tabular-nums">
                    TC {formatSrtTimestamp(currentTime)} / {formatSrtTimestamp(duration)}
                  </p>
                </div>
              )}

              {/* Measured Scrim & Live Synchronized Burmese Subtitle Overlay */}
              <div className="absolute inset-x-0 bottom-0 pt-12 pb-4 px-5 bg-gradient-to-t from-black/90 via-black/55 to-transparent flex flex-col items-center justify-end text-center pointer-events-none">
                {activeSegment ? (
                  <div className="space-y-1 max-w-full">
                    <p
                      data-testid="live-burmese-subtitle"
                      className="font-myanmar text-base sm:text-lg font-semibold text-amber-50 drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] whitespace-pre-line px-3 py-1 rounded bg-black/55"
                    >
                      {activeSegment.translatedText}
                    </p>
                    {showOriginalOverlay && (
                      <p className="text-xs text-slate-300/95 bg-black/45 px-2.5 py-0.5 rounded">
                        {activeSegment.originalText}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400/70 font-mono">
                    [No active subtitle at {formatDisplayTimecode(currentTime)}]
                  </p>
                )}
              </div>
            </div>

            {/* Playback & Timeline Scrubber Bar */}
            <div className="p-4 bg-slate-900/90 border-t border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={togglePlay}
                    aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
                    className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isPlaying ? 'Pause' : 'Play'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => seekTo(0)}
                    aria-label="Restart from beginning"
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer"
                  >
                    <SkipBack className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="font-mono tabular-nums text-xs text-slate-200">
                  {formatDisplayTimecode(currentTime)}{' '}
                  <span className="text-slate-500">/ {formatDisplayTimecode(duration)}</span>
                </div>

                <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showOriginalOverlay}
                    onChange={(e) => setShowOriginalOverlay(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-0"
                  />
                  <span>Bilingual Preview</span>
                </label>
              </div>

              {/* Interactive Timeline Scrubber + Segment Blocks */}
              <div className="space-y-1.5">
                <input
                  type="range"
                  aria-label="Timeline playhead scrubber"
                  min={0}
                  max={duration}
                  step={0.05}
                  value={currentTime}
                  onChange={(e) => seekTo(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                />

                <div className="relative h-5 bg-slate-950 rounded border border-slate-800 overflow-hidden">
                  {job.segments.map((seg) => {
                    const leftPct = Math.min(100, (seg.startTime / duration) * 100);
                    const widthPct = Math.max(
                      1.5,
                      Math.min(100 - leftPct, ((seg.endTime - seg.startTime) / duration) * 100)
                    );
                    const isActive = activeSegment?.id === seg.id;
                    return (
                      <button
                        key={seg.id}
                        type="button"
                        onClick={() => seekTo(seg.startTime + 0.05)}
                        title={`#${seg.index}: ${seg.translatedText}`}
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                        className={`absolute top-0.5 bottom-0.5 rounded-sm transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-amber-400 border border-amber-200'
                            : 'bg-slate-700/80 hover:bg-slate-600 border border-slate-600'
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Search & Replace Tool */}
          <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-amber-400" />
                <span>Search &amp; Replace Subtitle Text</span>
              </h3>
              <select
                aria-label="Search target field"
                value={searchField}
                onChange={(e) =>
                  setSearchField(e.target.value as 'translated' | 'original' | 'both')
                }
                className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-300"
              >
                <option value="translated">Burmese Subtitles</option>
                <option value="original">Original Transcription</option>
                <option value="both">Both Tracks</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                placeholder="Find word or name (e.g. ဦးသန့်ဇင်)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-myanmar focus:outline-none focus:border-amber-500"
              />
              <input
                type="text"
                placeholder="Replace with..."
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-myanmar focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400">
                {replaceFeedback || 'Maintain consistent character names and Burmese terminology.'}
              </span>
              <button
                type="button"
                onClick={handleSearchAndReplace}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Replace className="w-3.5 h-3.5 text-amber-400" />
                <span>Replace All</span>
              </button>
            </div>
          </div>

          {/* Gemini High Thinking Burmese Nuance Refinement */}
          <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Gemini High Thinking Burmese Refinement (gemini-4-carbon)</span>
              </h3>
            </div>

            <textarea
              rows={2}
              aria-label="Burmese refinement instruction"
              value={refineInstruction}
              onChange={(e) => setRefineInstruction(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            />

            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setRefineInstruction(
                      'Convert into natural conversational Yangon spoken Burmese with warm particles.'
                    )
                  }
                  className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded text-[11px] cursor-pointer"
                >
                  Conversational
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setRefineInstruction(
                      'Shorten verbose Burmese sentences so each subtitle fits comfortably on 1-2 lines.'
                    )
                  }
                  className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded text-[11px] cursor-pointer"
                >
                  Concise Pacing
                </button>
              </div>

              <button
                type="button"
                disabled={isRefining}
                onClick={() => void handleHighThinkingRefine()}
                className="px-3.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
              >
                {isRefining ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Thinking...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>Refine with High Thinking</span>
                  </>
                )}
              </button>
            </div>

            {refineFeedback && (
              <p className="text-[11px] text-amber-300/90 border-t border-slate-800 pt-2">
                {refineFeedback}
              </p>
            )}
          </div>

          {/* Live SRT File Preview & Copy */}
          <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200">
                UTF-8 .SRT Output Preview
              </span>
              <div className="flex items-center gap-2">
                <select
                  aria-label="SRT preview track mode"
                  value={srtPreviewMode}
                  onChange={(e) =>
                    setSrtPreviewMode(
                      e.target.value as 'translated' | 'original' | 'bilingual'
                    )
                  }
                  className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-300"
                >
                  <option value="translated">Myanmar Unicode (.my.srt)</option>
                  <option value="original">Original Track (.orig.srt)</option>
                  <option value="bilingual">Bilingual Track (.bilingual.srt)</option>
                </select>
                <button
                  type="button"
                  onClick={() => void handleCopySrt()}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] inline-flex items-center gap-1 cursor-pointer"
                >
                  {copiedSrt ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy SRT</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800/90 text-[11px] text-slate-300 font-mono overflow-x-auto max-h-44 whitespace-pre-wrap">
              {srtPreviewText}
            </pre>
          </div>
        </div>

        {/* Right 7 Columns: Interactive Subtitle Segment Table & Timing Validator */}
        <div className="lg:col-span-7 space-y-4">
          {/* Timing Validation Status Bar */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs">
              {timingDiagnostics.issues.length === 0 ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-slate-200 font-medium">
                    Timing Validated: {job.segments.length} chronological segments · Zero overlaps ·
                    Max 2 lines
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-amber-200 font-medium">
                    {timingDiagnostics.issues.length} timing/line advisory note(s) detected
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAutoNormalizeTiming}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Auto-Fix Timing &amp; 2-Line Wrap
              </button>
              <button
                type="button"
                onClick={() => handleAddSegmentAfter(job.segments.length - 1)}
                className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Subtitle</span>
              </button>
            </div>
          </div>

          {/* Segment Cards List */}
          <div className="space-y-3 max-h-[780px] overflow-y-auto pr-1">
            {job.segments.map((seg, idx) => {
              const isCurrent = activeSegment?.id === seg.id;
              const segDuration = Math.max(0.1, seg.endTime - seg.startTime);
              const lineCount = seg.translatedText.split('\n').filter(Boolean).length;
              const cps = (
                seg.translatedText.replace(/\s+/g, '').length / segDuration
              ).toFixed(1);

              const startDraftKey = `${seg.id}_startTime`;
              const endDraftKey = `${seg.id}_endTime`;

              return (
                <div
                  key={seg.id}
                  className={`p-4 rounded-xl border transition-colors ${
                    isCurrent
                      ? 'bg-amber-500/5 border-amber-500/50'
                      : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Top Row: Index, Editable SRT Timestamps, Metrics & Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-800/80">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => seekTo(seg.startTime + 0.05)}
                        aria-label={`Jump to segment ${seg.index}`}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-400 font-mono tabular-nums text-xs font-semibold cursor-pointer"
                      >
                        #{String(seg.index).padStart(2, '0')}
                      </button>

                      {/* Editable Start Time */}
                      <input
                        type="text"
                        aria-label={`Start timestamp for segment ${seg.index}`}
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
                        className="w-28 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-mono tabular-nums text-slate-200 focus:outline-none focus:border-amber-500"
                      />

                      <span className="text-slate-500 font-mono text-xs">--&gt;</span>

                      {/* Editable End Time */}
                      <input
                        type="text"
                        aria-label={`End timestamp for segment ${seg.index}`}
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
                        onBlur={(e) => handleTimestampBlur(seg.id, 'endTime', e.target.value)}
                        className="w-28 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-mono tabular-nums text-slate-200 focus:outline-none focus:border-amber-500"
                      />

                      <span className="text-[11px] font-mono tabular-nums text-slate-400">
                        ({segDuration.toFixed(1)}s · {lineCount}/2 lines · {cps} CPS)
                      </span>
                    </div>

                    {/* Segment Action Buttons */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleSplitSegment(seg.id)}
                        title="Split subtitle into 2 segments"
                        aria-label={`Split segment ${seg.index}`}
                        className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                      >
                        <Scissors className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAddSegmentAfter(idx)}
                        title="Insert new segment below"
                        aria-label={`Insert segment after ${seg.index}`}
                        className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteSegment(seg.id)}
                        disabled={job.segments.length <= 1}
                        title="Delete segment"
                        aria-label={`Delete segment ${seg.index}`}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors disabled:opacity-30 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Dual-Track Text Editors: Burmese Unicode + Original */}
                  <div className="grid grid-cols-1 gap-2.5">
                    <div>
                      <label
                        htmlFor={`burmese-text-${seg.id}`}
                        className="block text-[11px] text-amber-400/90 font-medium mb-1"
                      >
                        Myanmar Translation (Burmese Unicode)
                      </label>
                      <textarea
                        id={`burmese-text-${seg.id}`}
                        rows={2}
                        value={seg.translatedText}
                        onChange={(e) =>
                          handleSegmentTextChange(seg.id, 'translatedText', e.target.value)
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 font-myanmar focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor={`orig-text-${seg.id}`}
                        className="block text-[11px] text-slate-400 mb-1"
                      >
                        Original Transcription ({job.detectedLanguage})
                      </label>
                      <input
                        id={`orig-text-${seg.id}`}
                        type="text"
                        value={seg.originalText}
                        onChange={(e) =>
                          handleSegmentTextChange(seg.id, 'originalText', e.target.value)
                        }
                        className="w-full bg-slate-950/60 border border-slate-800/80 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-slate-600"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
