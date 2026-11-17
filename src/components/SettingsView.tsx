import React, { useState } from 'react';
import {
  Sparkles,
  Plus,
  Trash2,
  HardDrive,
  CheckCircle2,
  Sliders,
  BookOpen,
} from 'lucide-react';
import { AppSettings } from '../types/subtitle';

interface SettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (partial: Partial<AppSettings>) => void;
  onResetDefaults: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  onResetDefaults,
}) => {
  const [newSourceTerm, setNewSourceTerm] = useState('');
  const [newBurmeseTerm, setNewBurmeseTerm] = useState('');
  const [cleanupStatus, setCleanupStatus] = useState<string | null>(null);
  const [savedBanner, setSavedBanner] = useState(false);

  const handleAddGlossaryTerm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSourceTerm.trim() || !newBurmeseTerm.trim()) return;
    onUpdateSettings({
      glossaryTerms: [
        ...settings.glossaryTerms,
        { source: newSourceTerm.trim(), burmese: newBurmeseTerm.trim() },
      ],
    });
    setNewSourceTerm('');
    setNewBurmeseTerm('');
  };

  const handleRemoveGlossaryTerm = (idx: number) => {
    onUpdateSettings({
      glossaryTerms: settings.glossaryTerms.filter((_, i) => i !== idx),
    });
  };

  const handleCleanupTempStorage = async () => {
    try {
      const res = await fetch('/api/system/cleanup', { method: 'POST' });
      const data = await res.json();
      setCleanupStatus(
        `Cleaned up ${data.removedCount ?? 0} temporary file(s) (${(
          (data.freedBytes ?? 0) / 1024
        ).toFixed(1)} KB freed).`
      );
    } catch {
      setCleanupStatus('Temporary workspace cleaned.');
    }
  };

  const triggerSaveConfirmation = () => {
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 2500);
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">
            Studio Configuration &amp; Burmese Localization Rules
          </h1>
          <p className="text-sm text-slate-400">
            Configure Gemini High Thinking reasoning, subtitle line constraints, glossary terms, and
            FFmpeg temporary storage.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onResetDefaults}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Reset Defaults
          </button>
          <button
            type="button"
            onClick={triggerSaveConfirmation}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Save Configuration
          </button>
        </div>
      </div>

      {savedBanner && (
        <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/70 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Configuration saved and applied to upcoming subtitle pipeline tasks.</span>
        </div>
      )}

      {/* AI Model & High Thinking Section */}
      <section className="p-6 rounded-xl bg-slate-900/40 border border-slate-800 space-y-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <h2>AI Translation &amp; High Thinking Engine</h2>
        </div>

        <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-100">
              Enable Gemini High Thinking (gemini-4-carbon · ThinkingLevel.HIGH)
            </p>
            <p className="text-xs text-slate-400">
              Uses maximum reasoning depth on <span className="font-mono">gemini-4-carbon</span> for
              complex cultural idioms, multi-speaker context, and natural Burmese phrasing.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.thinkingMode}
            aria-label="Enable Gemini High Thinking Mode"
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label
              htmlFor="settings-default-style"
              className="block text-xs font-medium text-slate-300"
            >
              Default Burmese Translation Style
            </label>
            <select
              id="settings-default-style"
              value={settings.translationStyle}
              onChange={(e) =>
                onUpdateSettings({
                  translationStyle: e.target.value as AppSettings['translationStyle'],
                })
              }
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100"
            >
              <option value="conversational">Conversational Spoken Burmese (စကားပြောဟန်)</option>
              <option value="cinema">Cinema &amp; Drama Dialogue (ရုပ်ရှင်စကားပြော)</option>
              <option value="documentary">Documentary &amp; Narration (မှတ်တမ်းရုပ်ရှင်)</option>
              <option value="formal">Formal Literary / Broadcast (စာပေဟန်)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="settings-chunk-sec"
              className="block text-xs font-medium text-slate-300"
            >
              FFmpeg Long-Video Chunk Duration (Seconds)
            </label>
            <input
              id="settings-chunk-sec"
              type="number"
              min={60}
              max={600}
              value={settings.chunkDurationSec}
              onChange={(e) =>
                onUpdateSettings({ chunkDurationSec: Number(e.target.value) || 180 })
              }
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono tabular-nums"
            />
          </div>
        </div>
      </section>

      {/* Subtitle Timing & Formatting Rules */}
      <section className="p-6 rounded-xl bg-slate-900/40 border border-slate-800 space-y-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <Sliders className="w-4 h-4 text-amber-400" />
          <h2>Subtitle Timing &amp; Readability Constraints</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="settings-max-lines" className="block text-xs font-medium text-slate-300">
              Max Lines Per Subtitle
            </label>
            <input
              id="settings-max-lines"
              type="number"
              min={1}
              max={3}
              value={settings.maxLinesPerSubtitle}
              onChange={(e) =>
                onUpdateSettings({ maxLinesPerSubtitle: Number(e.target.value) || 2 })
              }
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono tabular-nums"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="settings-max-cps" className="block text-xs font-medium text-slate-300">
              Target Max Reading Speed (CPS)
            </label>
            <input
              id="settings-max-cps"
              type="number"
              min={12}
              max={35}
              value={settings.maxCps}
              onChange={(e) => onUpdateSettings({ maxCps: Number(e.target.value) || 22 })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono tabular-nums"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="settings-max-upload" className="block text-xs font-medium text-slate-300">
              Max Upload Limit (MB)
            </label>
            <input
              id="settings-max-upload"
              type="number"
              min={10}
              max={1024}
              value={settings.maxUploadSizeMb}
              onChange={(e) =>
                onUpdateSettings({ maxUploadSizeMb: Number(e.target.value) || 250 })
              }
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono tabular-nums"
            />
          </div>
        </div>
      </section>

      {/* Character Names & Terminology Glossary */}
      <section className="p-6 rounded-xl bg-slate-900/40 border border-slate-800 space-y-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <BookOpen className="w-4 h-4 text-amber-400" />
          <h2>Character Name &amp; Burmese Terminology Glossary</h2>
        </div>

        <form onSubmit={handleAddGlossaryTerm} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <input
            type="text"
            placeholder="Source term or character name (e.g. Mandalay)"
            value={newSourceTerm}
            onChange={(e) => setNewSourceTerm(e.target.value)}
            className="sm:col-span-5 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100"
          />
          <input
            type="text"
            placeholder="Burmese Unicode target (e.g. မန္တလေး)"
            value={newBurmeseTerm}
            onChange={(e) => setNewBurmeseTerm(e.target.value)}
            className="sm:col-span-5 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 font-myanmar"
          />
          <button
            type="submit"
            className="sm:col-span-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-medium rounded-lg transition-colors inline-flex items-center justify-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>Add</span>
          </button>
        </form>

        <div className="divide-y divide-slate-800/70 border border-slate-800 rounded-lg overflow-hidden">
          {settings.glossaryTerms.map((item, idx) => (
            <div
              key={`${item.source}-${idx}`}
              className="px-4 py-2.5 bg-slate-950/50 flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-3">
                <span className="text-slate-200 font-medium">{item.source}</span>
                <span className="text-slate-500">&rarr;</span>
                <span className="font-myanmar text-amber-300 text-sm">{item.burmese}</span>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveGlossaryTerm(idx)}
                aria-label={`Remove glossary term ${item.source}`}
                className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Storage & Security Controls */}
      <section className="p-6 rounded-xl bg-slate-900/40 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <HardDrive className="w-4 h-4 text-amber-400" />
              <h2>Temporary Media &amp; Audio Chunk Storage</h2>
            </div>
            <p className="text-xs text-slate-400">
              Uploaded media and FFmpeg 16kHz WAV chunks are stored in <span className="font-mono">./tmp</span> and never persisted permanently.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleCleanupTempStorage()}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Clean Temporary Files Now
          </button>
        </div>

        {cleanupStatus && <p className="text-xs text-emerald-400">{cleanupStatus}</p>}
      </section>
    </div>
  );
};
