import React, { useState, useMemo } from 'react';
import {
  Search,
  Download,
  RotateCcw,
  Trash2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileVideo,
  Plus,
} from 'lucide-react';
import { ProcessingJob } from '../types/subtitle';
import { formatDisplayTimecode } from '../utils/subtitleUtils';

interface HistoryViewProps {
  jobs: ProcessingJob[];
  onOpenInEditor: (jobId: string) => void;
  onRetryJob: (jobId: string) => Promise<void>;
  onDeleteJob: (jobId: string) => void;
  onExportSrt: (job: ProcessingJob, mode: 'translated' | 'original' | 'bilingual') => void;
  onNavigateGenerator: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  jobs,
  onOpenInEditor,
  onRetryJob,
  onDeleteJob,
  onExportSrt,
  onNavigateGenerator,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'processing' | 'failed'>(
    'all'
  );

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
      const matchesSearch =
        !searchTerm.trim() ||
        job.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        job.detectedLanguage.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [jobs, searchTerm, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Processing History &amp; Archive</h1>
          <p className="text-sm text-slate-400">
            Manage completed Burmese subtitle tasks, retry interrupted jobs, or export UTF-8 SRT
            files.
          </p>
        </div>

        <button
          type="button"
          onClick={onNavigateGenerator}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Subtitle Task</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            aria-label="Filter history by file name or language"
            placeholder="Search by file name or detected language..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Interactive Segmented Status Filter */}
        <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
          {(['all', 'completed', 'processing', 'failed'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                statusFilter === status
                  ? 'bg-slate-800 text-amber-400 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Jobs Table or Empty State */}
      {filteredJobs.length === 0 ? (
        <div className="p-12 border border-slate-800 rounded-xl bg-slate-900/30 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center">
            <FileVideo className="w-6 h-6 text-slate-400" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-200">No Matching Subtitle Tasks</h2>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Upload a video or audio file in the Subtitle Generator to extract speech and generate
              synchronized Myanmar Unicode subtitles.
            </p>
          </div>
          <button
            type="button"
            onClick={onNavigateGenerator}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <span>Start First Subtitle Task</span>
          </button>
        </div>
      ) : (
        <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/30">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-400 bg-slate-900/70">
                  <th className="py-3 px-4 font-medium">File Name &amp; Format</th>
                  <th className="py-3 px-4 font-medium">Language Pair</th>
                  <th className="py-3 px-4 font-medium">AI Model &amp; Style</th>
                  <th className="py-3 px-4 font-medium text-right">Duration</th>
                  <th className="py-3 px-4 font-medium text-right">Segments</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-sm">
                {filteredJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-100">{job.fileName}</div>
                      <div className="text-xs text-slate-400 font-mono tabular-nums">
                        {job.format} · {(job.fileSize / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-300">
                      {job.detectedLanguage} &rarr; Myanmar (Unicode)
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-300">
                      <span className="capitalize">{job.translationStyle}</span> ·{' '}
                      <span className="font-mono text-slate-400">{job.modelUsed}</span>
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
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1.5 text-rose-400">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Failed</span>
                          </span>
                          {job.error && (
                            <p className="text-[11px] text-rose-300/80 max-w-xs truncate">
                              {job.error}
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        {job.status === 'failed' && (
                          <button
                            type="button"
                            onClick={() => void onRetryJob(job.id)}
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Retry</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onOpenInEditor(job.id)}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Open Editor
                        </button>

                        {job.status === 'completed' && (
                          <button
                            type="button"
                            onClick={() => onExportSrt(job, 'translated')}
                            aria-label={`Download Burmese SRT for ${job.fileName}`}
                            className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Burmese .SRT</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onDeleteJob(job.id)}
                          aria-label={`Remove ${job.fileName} from history`}
                          className="p-1.5 text-slate-400 hover:text-rose-400 rounded-md transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
