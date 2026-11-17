import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  KeyRound,
  Sparkles,
  Languages,
  Save,
  Wifi,
} from 'lucide-react';
import { AppSettings, GeminiModelId } from '../types/subtitle';

interface ApiSettingsPageProps {
  settings: AppSettings;
  onUpdateSettings: (partial: Partial<AppSettings>) => void;
  onBackHome: () => void;
}

interface ServerApiConfig {
  groq: {
    hasKey: boolean;
    maskedKey: string;
    whisperModel: string;
  };
  gemini: {
    hasKey: boolean;
    maskedKey: string;
    geminiModel: GeminiModelId;
    availableModels: Array<{ id: string; label: string }>;
  };
}

export const ApiSettingsPage: React.FC<ApiSettingsPageProps> = ({
  settings,
  onUpdateSettings,
  onBackHome,
}) => {
  // Groq API states
  const [groqInput, setGroqInput] = useState<string>('');
  const [groqMasked, setGroqMasked] = useState<string>('');
  const [hasGroqKey, setHasGroqKey] = useState<boolean>(false);
  const [showGroqKey, setShowGroqKey] = useState<boolean>(false);
  const [whisperModel, setWhisperModel] = useState<string>('whisper-large-v3');
  const [groqSaving, setGroqSaving] = useState<boolean>(false);
  const [groqTesting, setGroqTesting] = useState<boolean>(false);
  const [groqStatus, setGroqStatus] = useState<{
    type: 'idle' | 'success' | 'error';
    message: string;
  }>({
    type: 'idle',
    message: 'ချိတ်ဆက်မှု မစမ်းသပ်ရသေးပါ။',
  });

  // Gemini API states
  const [geminiInput, setGeminiInput] = useState<string>('');
  const [geminiMasked, setGeminiMasked] = useState<string>('');
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean>(false);
  const [showGeminiKey, setShowGeminiKey] = useState<boolean>(false);
  const [geminiModel, setGeminiModel] = useState<GeminiModelId>(
    settings.modelName || 'gemini-3.1-pro-preview'
  );
  const [geminiSaving, setGeminiSaving] = useState<boolean>(false);
  const [geminiTesting, setGeminiTesting] = useState<boolean>(false);
  const [geminiStatus, setGeminiStatus] = useState<{
    type: 'idle' | 'success' | 'error';
    message: string;
  }>({
    type: 'success',
    message:
      'Built-in Gemini API Key အသင့်ထည့်သွင်းထားပြီး ချိတ်ဆက်မှု အသင့်ရှိပါသည် (သီးသန့် Key ထပ်ထည့်ရန် မလိုအပ်ပါ)။',
  });

  // Load masked API config from backend on mount
  useEffect(() => {
    let mounted = true;
    fetch('/api/settings/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ServerApiConfig | null) => {
        if (!mounted || !data) return;
        setHasGroqKey(data.groq.hasKey);
        setGroqMasked(data.groq.maskedKey || '');
        setWhisperModel(data.groq.whisperModel || 'whisper-large-v3');

        setHasGeminiKey(data.gemini.hasKey);
        setGeminiMasked(data.gemini.maskedKey || '');
        if (data.gemini.geminiModel) {
          setGeminiModel(data.gemini.geminiModel);
        }
        if (data.gemini.hasKey) {
          setGeminiStatus({
            type: 'success',
            message:
              'Built-in Gemini API Key အသင့်ထည့်သွင်းထားပြီး ချိတ်ဆက်မှု အသင့်ရှိပါသည် (သီးသန့် Key ထပ်ထည့်ရန် မလိုအပ်ပါ)။',
          });
        }
      })
      .catch(() => {
        // ignore
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSaveGroq = async () => {
    setGroqSaving(true);
    try {
      const res = await fetch('/api/settings/groq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: groqInput.trim(),
          whisperModel,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setHasGroqKey(Boolean(data.hasKey));
        setGroqMasked(data.maskedKey || '');
        setGroqInput(''); // Clear raw key from input after saving so complete key is never shown
        setShowGroqKey(false);
        setGroqStatus({
          type: 'success',
          message:
            data.message ||
            'Groq API Key ကို လုံခြုံစွာ သိမ်းဆည်းပြီးပါပြီ (Key အပြည့်အစုံကို ဖုံးကွယ်ထားပါသည်)။',
        });
      } else {
        setGroqStatus({
          type: 'error',
          message: data.error || 'Groq API သိမ်းဆည်းရာတွင် အမှားဖြစ်ပေါ်နေပါသည်။',
        });
      }
    } catch {
      setGroqStatus({
        type: 'error',
        message: 'ဆာဗာသို့ ဆက်သွယ်ရာတွင် အမှားဖြစ်ပေါ်နေပါသည်။',
      });
    } finally {
      setGroqSaving(false);
    }
  };

  const handleTestGroq = async () => {
    setGroqTesting(true);
    setGroqStatus({
      type: 'idle',
      message: 'Groq ဆာဗာသို့ တိုက်ရိုက်ချိတ်ဆက် စမ်းသပ်နေပါသည်...',
    });
    try {
      const res = await fetch('/api/settings/test-groq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: groqInput.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok && data.maskedKey) {
        setHasGroqKey(true);
        setGroqMasked(data.maskedKey);
        setGroqInput('');
        setShowGroqKey(false);
      }
      setGroqStatus({
        type: data.ok ? 'success' : 'error',
        message: data.message,
      });
    } catch {
      setGroqStatus({
        type: 'error',
        message: 'Groq API ချိတ်ဆက်မှု စမ်းသပ်ရာတွင် ကွန်ရက်အမှား ဖြစ်ပေါ်နေပါသည်။',
      });
    } finally {
      setGroqTesting(false);
    }
  };

  const handleSaveGemini = async () => {
    setGeminiSaving(true);
    try {
      const res = await fetch('/api/settings/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: geminiInput.trim(),
          geminiModel,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setHasGeminiKey(Boolean(data.hasKey));
        setGeminiMasked(data.maskedKey || '');
        setGeminiInput(''); // Clear raw key from input after saving
        setShowGeminiKey(false);
        onUpdateSettings({
          modelName: geminiModel,
          thinkingMode: true,
        });
        setGeminiStatus({
          type: 'success',
          message:
            data.message ||
            'Gemini API သတ်မှတ်ချက်ကို လုံခြုံစွာ သိမ်းဆည်းပြီးပါပြီ (Key အပြည့်အစုံကို ဖုံးကွယ်ထားပါသည်)။',
        });
      } else {
        setGeminiStatus({
          type: 'error',
          message: data.error || 'Gemini API သိမ်းဆည်းရာတွင် အမှားဖြစ်ပေါ်နေပါသည်။',
        });
      }
    } catch {
      setGeminiStatus({
        type: 'error',
        message: 'ဆာဗာသို့ ဆက်သွယ်ရာတွင် အမှားဖြစ်ပေါ်နေပါသည်။',
      });
    } finally {
      setGeminiSaving(false);
    }
  };

  const handleTestGemini = async () => {
    setGeminiTesting(true);
    setGeminiStatus({
      type: 'idle',
      message: `Gemini (${geminiModel}) သို့ တိုက်ရိုက်ချိတ်ဆက် စမ်းသပ်နေပါသည်...`,
    });
    try {
      const res = await fetch('/api/settings/test-gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: geminiInput.trim() || undefined,
          geminiModel,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        if (data.maskedKey) {
          setHasGeminiKey(true);
          setGeminiMasked(data.maskedKey);
          setGeminiInput('');
          setShowGeminiKey(false);
        }
        onUpdateSettings({
          modelName: geminiModel,
          thinkingMode: true,
        });
      }
      setGeminiStatus({
        type: data.ok ? 'success' : 'error',
        message: data.message,
      });
    } catch {
      setGeminiStatus({
        type: 'error',
        message: 'Gemini API ချိတ်ဆက်မှု စမ်းသပ်ရာတွင် ကွန်ရက်အမှား ဖြစ်ပေါ်နေပါသည်။',
      });
    } finally {
      setGeminiTesting(false);
    }
  };

  const handleBackHomeWithAutoSave = async () => {
    try {
      if (groqInput.trim().length > 0) {
        await fetch('/api/settings/groq', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: groqInput.trim(), whisperModel }),
        });
      }
      if (geminiInput.trim().length > 0 || geminiModel !== settings.modelName) {
        await fetch('/api/settings/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: geminiInput.trim(), geminiModel }),
        });
        onUpdateSettings({
          modelName: geminiModel,
          thinkingMode: true,
        });
      }
    } catch {
      // ignore background save error
    }
    onBackHome();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 font-myanmar">
      {/* Top Header with Back to Home */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">API သတ်မှတ်ချက်များ</h1>
          <p className="text-sm text-slate-400 mt-1">
            အသံမှ စာသားထုတ်ယူရန် Groq API နှင့် မြန်မာဘာသာပြန်ဆိုရန် Gemini API တို့ကို သတ်မှတ်ပါ။
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleBackHomeWithAutoSave()}
          className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-amber-400" />
          <span>ပင်မစာမျက်နှာသို့ ပြန်သွားရန်</span>
        </button>
      </div>

      {/* API Key Security Notice */}
      <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs text-slate-300">
          <p className="font-semibold text-slate-100">API Key လုံခြုံရေး အသိပေးချက်</p>
          <p className="text-slate-400 leading-relaxed">
            သင်၏ API Key များသည် လျှို့ဝှက်ထားရမည့် သော့ချက်များဖြစ်ပါသည်။ သိမ်းဆည်းလိုက်သော API Key
            များကို Frontend JavaScript တွင် လုံးဝမဖော်ပြဘဲ Backend ဆာဗာပေါ်တွင်သာ လုံခြုံစွာ
            သိမ်းဆည်းထားပြီး သိမ်းဆည်းပြီးနောက် Key အပြည့်အစုံကို ပြန်လည်ဖော်ပြမည် မဟုတ်ပါ။
          </p>
        </div>
      </div>

      {/* SECTION 1: GROQ API */}
      <section className="p-6 rounded-xl bg-slate-900/50 border border-slate-800 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-base font-bold text-slate-100">၁။ Groq API (အသံမှ စာသားနှင့် အချိန်မှတ်တမ်း ထုတ်ယူရန်)</h2>
              <p className="text-xs text-slate-400">
                မူရင်းအသံမှ စကားပြောစာသားနှင့် တိကျသော အချိန်မှတ်တမ်း (Timestamps) များ ထုတ်ယူရန် အသုံးပြုပါသည်။
              </p>
            </div>
          </div>

          <span className="text-xs font-mono text-amber-400">
            Model · {whisperModel}
          </span>
        </div>

        <div className="space-y-4">
          {/* Saved Masked Key Status */}
          {hasGroqKey && groqMasked && (
            <div className="flex items-center justify-between px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs">
              <span className="text-slate-400">လက်ရှိ သိမ်းဆည်းထားသော Key (ဖုံးကွယ်ထားသည်):</span>
              <span className="font-mono text-emerald-400">{groqMasked}</span>
            </div>
          )}

          {/* Groq API Key Input */}
          <div className="space-y-2">
            <label htmlFor="groq-api-key-input" className="block text-sm font-medium text-slate-200">
              Groq API Key
            </label>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <input
                  id="groq-api-key-input"
                  type={showGroqKey ? 'text' : 'password'}
                  value={groqInput}
                  onChange={(e) => setGroqInput(e.target.value)}
                  placeholder={
                    hasGroqKey
                      ? 'Key အသစ်ပြောင်းလိုမှသာ ထပ်မံရိုက်ထည့်ပါ (gsk_...)'
                      : 'gsk_... ဖြင့်စသော Groq API Key ရိုက်ထည့်ပါ'
                  }
                  autoComplete="off"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-3.5 pr-24 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={() => setShowGroqKey((v) => !v)}
                  aria-label={showGroqKey ? 'Groq API Key ဖျောက်ရန်' : 'Groq API Key ပြရန်'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs inline-flex items-center gap-1 cursor-pointer"
                >
                  {showGroqKey ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>ဖျောက်ရန်</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5" />
                      <span>ပြရန်</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Preferred Whisper Model */}
          <div className="space-y-1.5">
            <label htmlFor="groq-whisper-model" className="block text-xs font-medium text-slate-300">
              အသံဖတ်ရှုမည့် AI မော်ဒယ် (Speech Recognition Model)
            </label>
            <select
              id="groq-whisper-model"
              value={whisperModel}
              onChange={(e) => setWhisperModel(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono"
            >
              <option value="whisper-large-v3">whisper-large-v3 (အကြံပြုထားသော အကောင်းဆုံး မော်ဒယ်)</option>
              <option value="whisper-large-v3-turbo">whisper-large-v3-turbo (မြန်ဆန်သော မော်ဒယ်)</option>
            </select>
          </div>

          {/* Save & Test Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              disabled={groqSaving}
              onClick={() => void handleSaveGroq()}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {groqSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>သိမ်းဆည်းရန်</span>
            </button>

            <button
              type="button"
              disabled={groqTesting}
              onClick={() => void handleTestGroq()}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {groqTesting ? (
                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
              ) : (
                <Wifi className="w-4 h-4 text-amber-400" />
              )}
              <span>ချိတ်ဆက်မှု စမ်းသပ်ရန်</span>
            </button>
          </div>

          {/* Connection Status Box */}
          <div
            role="status"
            className={`p-3.5 rounded-lg border text-xs flex items-start gap-2.5 overflow-hidden ${
              groqStatus.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-800/70 text-emerald-200'
                : groqStatus.type === 'error'
                ? 'bg-rose-950/40 border-rose-800/70 text-rose-200'
                : 'bg-slate-950/60 border-slate-800 text-slate-300'
            }`}
          >
            {groqStatus.type === 'success' && (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            )}
            {groqStatus.type === 'error' && (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 break-words">
              <span className="font-semibold">ချိတ်ဆက်မှု အခြေအနေ - </span>
              <span>{groqStatus.message}</span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: GEMINI API */}
      <section className="p-6 rounded-xl bg-slate-900/50 border border-slate-800 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-base font-bold text-slate-100">
                ၂။ Gemini API (သဘာဝကျသော မြန်မာဘာသာပြန်ဆိုရန်)
              </h2>
              <p className="text-xs text-slate-400">
                မူရင်းအချိန်မှတ်တမ်းများကို လုံးဝမပြောင်းလဲဘဲ ရှေ့နောက်အကြောင်းအရာ ဆက်စပ်၍ သဘာဝကျသော မြန်မာစကားပြောသို့ ပြန်ဆိုပေးပါသည်။
              </p>
            </div>
          </div>

          <span className="text-xs font-mono text-amber-400">
            Model · {geminiModel}
          </span>
        </div>

        <div className="space-y-4">
          {/* Saved Masked Key Status */}
          {hasGeminiKey && geminiMasked && (
            <div className="flex items-center justify-between px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs">
              <span className="text-slate-400">လက်ရှိ သိမ်းဆည်းထားသော Key (ဖုံးကွယ်ထားသည်):</span>
              <span className="font-mono text-emerald-400">{geminiMasked}</span>
            </div>
          )}

          {/* Gemini API Key Input */}
          <div className="space-y-2">
            <label
              htmlFor="gemini-api-key-input"
              className="block text-sm font-medium text-slate-200"
            >
              Gemini API Key
            </label>
            <div className="relative">
              <input
                id="gemini-api-key-input"
                type={showGeminiKey ? 'text' : 'password'}
                value={geminiInput}
                onChange={(e) => setGeminiInput(e.target.value)}
                placeholder={
                  hasGeminiKey
                    ? 'Key အသစ်ပြောင်းလိုမှသာ ထပ်မံရိုက်ထည့်ပါ (AIza...)'
                    : 'AIza... ဖြင့်စသော Gemini API Key ရိုက်ထည့်ပါ'
                }
                autoComplete="off"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-3.5 pr-24 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={() => setShowGeminiKey((v) => !v)}
                aria-label={showGeminiKey ? 'Gemini API Key ဖျောက်ရန်' : 'Gemini API Key ပြရန်'}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs inline-flex items-center gap-1 cursor-pointer"
              >
                {showGeminiKey ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>ဖျောက်ရန်</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    <span>ပြရန်</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Gemini Translation Model Selector */}
          <div className="space-y-1.5">
            <label
              htmlFor="gemini-model-select"
              className="block text-xs font-medium text-slate-300"
            >
              မြန်မာဘာသာပြန်မည့် Gemini မော်ဒယ် ရွေးချယ်ရန် (Gemini 3.1 Pro ရွေးချယ်ထားသည်)
            </label>
            <select
              id="gemini-model-select"
              value={geminiModel}
              onChange={(e) => {
                const nextModel = e.target.value as GeminiModelId;
                setGeminiModel(nextModel);
                onUpdateSettings({
                  modelName: nextModel,
                  thinkingMode: true,
                });
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-100"
            >
              <option value="gemini-3.1-pro-preview">
                Gemini 3.1 Pro (gemini-3.1-pro-preview — မြန်မာစာ အကောင်းဆုံးနှင့် သဘာဝအကျဆုံး မော်ဒယ်)
              </option>
              <option value="gemini-3-flash-preview">
                Gemini 3 Flash (gemini-3-flash-preview — မြန်ဆန်သော ဘာသာပြန် မော်ဒယ်)
              </option>
              <option value="gemini-2.5-pro">
                Gemini 2.5 Pro (gemini-2.5-pro — အဆင့်မြင့် ဘာသာပြန် မော်ဒယ်)
              </option>
              <option value="gemini-2.5-flash">
                Gemini 2.5 Flash (gemini-2.5-flash — ပေါ့ပါးမြန်ဆန်သော မော်ဒယ်)
              </option>
            </select>
          </div>

          {/* Save & Test Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              disabled={geminiSaving}
              onClick={() => void handleSaveGemini()}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {geminiSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>သိမ်းဆည်းရန်</span>
            </button>

            <button
              type="button"
              disabled={geminiTesting}
              onClick={() => void handleTestGemini()}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {geminiTesting ? (
                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
              ) : (
                <Wifi className="w-4 h-4 text-amber-400" />
              )}
              <span>ချိတ်ဆက်မှု စမ်းသပ်ရန်</span>
            </button>
          </div>

          {/* Connection Status Box */}
          <div
            role="status"
            className={`p-3.5 rounded-lg border text-xs flex items-start gap-2.5 overflow-hidden ${
              geminiStatus.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-800/70 text-emerald-200'
                : geminiStatus.type === 'error'
                ? 'bg-rose-950/40 border-rose-800/70 text-rose-200'
                : 'bg-slate-950/60 border-slate-800 text-slate-300'
            }`}
          >
            {geminiStatus.type === 'success' && (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            )}
            {geminiStatus.type === 'error' && (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 break-words">
              <span className="font-semibold">ချိတ်ဆက်မှု အခြေအနေ - </span>
              <span>{geminiStatus.message}</span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: LANGUAGE SETTINGS */}
      <section className="p-6 rounded-xl bg-slate-900/50 border border-slate-800 space-y-4">
        <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
          <Languages className="w-5 h-5 text-amber-400" />
          <div>
            <h2 className="text-base font-bold text-slate-100">၃။ ဘာသာစကား သတ်မှတ်ချက်များ</h2>
            <p className="text-xs text-slate-400">
              မြန်မာဘာသာပြန်ဆိုရာတွင် အသုံးပြုမည့် စကားပြောဟန်နှင့် စာကြောင်းအရှည်ကို ရွေးချယ်ပါ။
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label
              htmlFor="lang-style-setting"
              className="block text-xs font-medium text-slate-300"
            >
              မြန်မာဘာသာပြန် စကားပြောပုံစံ
            </label>
            <select
              id="lang-style-setting"
              value={settings.translationStyle}
              onChange={(e) =>
                onUpdateSettings({
                  translationStyle: e.target.value as AppSettings['translationStyle'],
                })
              }
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-100"
            >
              <option value="conversational">သဘာဝ စကားပြောဟန် (နေ့စဉ်သုံး မြန်မာစကားပြော)</option>
              <option value="cinema">ရုပ်ရှင်နှင့် ဇာတ်လမ်းတွဲ စကားပြောဟန်</option>
              <option value="documentary">မှတ်တမ်းရုပ်ရှင်နှင့် ပညာပေးဟန်</option>
              <option value="formal">ယဉ်ကျေးသော စာပေ/သတင်းဟန်</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="lang-max-lines"
              className="block text-xs font-medium text-slate-300"
            >
              စာတန်းထိုး တစ်ခုလျှင် အများဆုံး စာကြောင်းရေ
            </label>
            <select
              id="lang-max-lines"
              value={settings.maxLinesPerSubtitle}
              onChange={(e) =>
                onUpdateSettings({ maxLinesPerSubtitle: Number(e.target.value) || 2 })
              }
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-100"
            >
              <option value={2}>၂ ကြောင်း (စံသတ်မှတ်ချက်)</option>
              <option value={1}>၁ ကြောင်းတည်း</option>
            </select>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={() => void handleBackHomeWithAutoSave()}
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors inline-flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>ပင်မစာမျက်နှာသို့ ပြန်သွားရန်</span>
          </button>
        </div>
      </section>
    </div>
  );
};
