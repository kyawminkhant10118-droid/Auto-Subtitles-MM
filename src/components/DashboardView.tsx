import React from 'react';
import {
  FileVideo,
  Languages,
  Play,
  Download,
  Sliders,
  ArrowRight,
  Cpu,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { AppSettings, ProcessingJob } from '../types/subtitle';
import { formatDisplayTimecode } from '../utils/subtitleUtils';

interface DashboardViewProps {
  jobs: ProcessingJob[];
  settings: AppSettings;
  onNavigate: (page: 'dashboard' | 'generator' | 'editor' | 'history' | 'settings') => void;
  onSelectJobForEditor: (jobId: string) => void;
  onExportSrt: (job: ProcessingJob, mode: 'translated' | 'original' | 'bilingual') => void;
  onRunSamplePipeline: () => void;
  isStartingSample: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  jobs,
  settings,
  onNavigate,
  onSelectJobForEditor,
  onExportSrt,
  onRunSamplePipeline,
  isStartingSample,
}) => {
  const completedJobs = jobs.filter((j) => j.status === 'completed');
  const totalSegments = completedJobs.reduce((acc, j) => acc + j.segments.length, 0);
  const totalDurationSec = completedJobs.reduce((acc, j) => acc + j.durationSeconds, 0);

  return (
    <div className="space-y-10">
      {/* Hero Split Section */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch border-b border-slate-800/80 pb-10">
        <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <p className="text-xs font-medium text-amber-400/90 tracking-wide">
              FFmpeg Audio Extraction · Speech Recognition · Gemini High Thinking Localization
            </p>
            <h1
              className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-50 leading-tight"
              style={{ textWrap: 'balance' }}
            >
              Automated Video Subtitling &amp; Natural Myanmar Unicode Translation
            </h1>
            <p className="text-slate-300 text-base leading-relaxed max-w-2xl">
              Extract 16kHz studio audio with FFmpeg, detect spoken languages automatically, and
              translate timestamped dialogue into fluent conversational Burmese Unicode using{' '}
              <span className="text-slate-100 font-medium">gemini-4-carbon</span> with high-depth
              contextual reasoning.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button
              type="button"
              onClick={() => onNavigate('generator')}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileVideo className="w-4 h-4" />
              <span>Upload Media File</span>
            </button>

            <button
              type="button"
              onClick={onRunSamplePipeline}
              disabled={isStartingSample}
              className="px-5 py-2.5 bg-slate-800/90 hover:bg-slate-800 text-slate-100 border border-slate-700 font-medium text-sm rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
            >
              <Play className="w-4 h-4 text-amber-400" />
              <span>
                {isStartingSample
                  ? 'Synthesizing & Starting Pipeline...'
                  : 'Run Live FFmpeg + Gemini Demo'}
              </span>
            </button>

            {completedJobs[0] && (
              <button
                type="button"
                onClick={() => onSelectJobForEditor(completedJobs[0].id)}
                className="px-4 py-2.5 text-slate-300 hover:text-white text-sm font-medium transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Open Subtitle Editor</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Burmese Localization Comparison Proof */}
        <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Contextual Burmese Localization Benchmark</span>
              <span className="font-mono tabular-nums">00:00:10,000 --&gt; 00:00:15,800</span>
            </div>
            <p className="text-sm text-slate-200 font-medium pt-1">
              &ldquo;Literal machine translation often sounds stiff, so context is everything.&rdquo;
            </p>
          </div>

          <div className="space-y-4 divide-y divide-slate-800/80">
            <div className="pt-2 space-y-1">
              <p className="text-xs text-rose-400 font-medium">
                Avoided: Literal Word-for-Word Translation
              </p>
              <p className="font-myanmar text-sm text-slate-400 line-through">
                စာသားအတိုင်း စက်ဘာသာပြန်ခြင်းသည် မကြာခဏ မာကျောသောအသံထွက်သောကြောင့် အကြောင်းအရာသည် အရာအားလုံးဖြစ်သည်။
              </p>
            </div>

            <div className="pt-4 space-y-1.5">
              <p className="text-xs text-emerald-400 font-medium">
                MingalarSub Output: Natural Conversational Myanmar (Unicode)
              </p>
              <p className="font-myanmar text-base text-slate-100 font-medium">
                တိုက်ရိုက်စက်ဘာသာပြန်တာတွေက တောင့်တင်းနေတတ်လို့
                <br />
                ရှေ့နောက်အကြောင်းအရာ ဆက်စပ်မှုက အရေးအကြီးဆုံးပါပဲ။
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Max 2 lines · UTF-8 Burmese Unicode</span>
            <span className="font-mono tabular-nums">14.8 chars/sec</span>
          </div>
        </div>
      </section>

      {/* 4-Column KPI Metric Strip */}
      <section
        aria-label="Studio Metrics"
        className="grid grid-cols-2 lg:grid-cols-4 border border-slate-800 rounded-xl bg-slate-900/40 divide-y lg:divide-y-0 lg:divide-x divide-slate-800"
      >
        <div className="p-5 space-y-1">
          <p className="text-xs text-slate-400">Processed Media Tasks</p>
          <p className="text-2xl font-bold text-slate-100 font-mono tabular-nums">{jobs.length}</p>
          <p className="text-xs text-slate-400">
            {completedJobs.length} completed · {jobs.filter((j) => j.status === 'processing').length}{' '}
            active
          </p>
        </div>

        <div className="p-5 space-y-1">
          <p className="text-xs text-slate-400">Synchronized Segments</p>
          <p className="text-2xl font-bold text-slate-100 font-mono tabular-nums">
            {totalSegments}
          </p>
          <p className="text-xs text-slate-400">
            Total media duration {formatDisplayTimecode(totalDurationSec)}
          </p>
        </div>

        <div className="p-5 space-y-1">
          <p className="text-xs text-slate-400">Active Reasoning Engine</p>
          <p className="text-lg font-bold text-amber-400 font-mono truncate">
            {settings.thinkingMode ? 'gemini-4-carbon' : settings.modelName}
          </p>
          <p className="text-xs text-slate-400">
            {settings.thinkingMode ? 'ThinkingLevel.HIGH enabled' : 'Standard latency mode'}
          </p>
        </div>

        <div className="p-5 space-y-1">
          <p className="text-xs text-slate-400">Subtitle Timing Standard</p>
          <p className="text-2xl font-bold text-slate-100 font-mono tabular-nums">
            {settings.maxLinesPerSubtitle} Lines Max
          </p>
          <p className="text-xs text-slate-400 font-mono tabular-nums">
            Target &le; {settings.maxCharsPerLine} chars/line · {settings.maxCps} CPS
          </p>
        </div>
      </section>

      {/* Recent Processing Tasks Table */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">Recent Subtitle Projects</h2>
            <p className="text-xs text-slate-400">
              Select any processed video or audio task to inspect timestamps, edit Burmese text, or
              export UTF-8 SRT files.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('history')}
            className="text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            View All History ({jobs.length})
          </button>
        </div>

        <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/30">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-400 bg-slate-900/70">
                  <th className="py-3 px-4 font-medium">Media File</th>
                  <th className="py-3 px-4 font-medium">Detected Language</th>
                  <th className="py-3 px-4 font-medium">Style &amp; Model</th>
                  <th className="py-3 px-4 font-medium text-right">Duration</th>
                  <th className="py-3 px-4 font-medium text-right">Segments</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-sm">
                {jobs.slice(0, 5).map((job) => (
                  <tr
                    key={job.id}
                    className="hover:bg-slate-800/40 transition-colors group"
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-100 truncate max-w-xs">
                        {job.fileName}
                      </div>
                      <div className="text-xs text-slate-400 font-mono tabular-nums">
                        {job.format} · {(job.fileSize / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-300 text-xs">
                      {job.detectedLanguage} ·{' '}
                      <span className="font-mono uppercase">{job.detectedLanguageCode}</span>{' '}
                      &rarr; Myanmar (my)
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-300">
                      <span className="capitalize">{job.translationStyle}</span> ·{' '}
                      <span className="text-slate-400 font-mono">{job.modelUsed}</span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-300">
                      {formatDisplayTimecode(job.durationSeconds)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-300">
                      {job.segments.length}
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      {job.status === 'completed' && (
                        <span className="inline-flex items-center gap-1.5 text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Completed</span>
                        </span>
                      )}
                      {job.status === 'processing' && (
                        <span className="inline-flex items-center gap-1.5 text-amber-400 font-mono tabular-nums">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Processing ({job.progress}%)</span>
                        </span>
                      )}
                      {job.status === 'failed' && (
                        <span className="inline-flex items-center gap-1.5 text-rose-400">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Failed</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectJobForEditor(job.id)}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Edit &amp; Preview
                        </button>
                        {job.status === 'completed' && (
                          <button
                            type="button"
                            onClick={() => onExportSrt(job, 'translated')}
                            aria-label={`Download Burmese SRT for ${job.fileName}`}
                            className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>.SRT</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Architecture Pipeline Summary Strip */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
        <div className="p-5 border border-slate-800 rounded-xl bg-slate-900/20 space-y-2">
          <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
            <Cpu className="w-4 h-4 text-amber-400" />
            <span>01. FFmpeg Audio Extraction &amp; Chunking</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Automatically probes video/audio containers (MP4, MKV, MOV, MP3, WAV, M4A), extracts
            16kHz mono PCM audio, and splits long recordings into lossless segments.
          </p>
        </div>

        <div className="p-5 border border-slate-800 rounded-xl bg-slate-900/20 space-y-2">
          <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
            <Languages className="w-4 h-4 text-amber-400" />
            <span>02. High-Thinking Burmese Localization</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Uses <span className="font-mono text-slate-300">gemini-4-carbon</span> with{' '}
            <span className="font-mono text-slate-300">ThinkingLevel.HIGH</span> to translate
            idioms, honorifics, and spoken dialogue into authentic Burmese Unicode.
          </p>
        </div>

        <div className="p-5 border border-slate-800 rounded-xl bg-slate-900/20 space-y-2">
          <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
            <Sliders className="w-4 h-4 text-amber-400" />
            <span>03. NLE Timeline &amp; Timing Validation</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Enforces non-overlapping timestamps, chronological sequencing, and a maximum of 2 lines
            per subtitle before exporting UTF-8 encoded <span className="font-mono">.srt</span>{' '}
            files.
          </p>
        </div>
      </section>
    </div>
  );
};
