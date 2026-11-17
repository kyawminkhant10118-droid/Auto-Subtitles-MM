import { AppSettings, PipelineStageInfo, ProcessingJob } from '../types/subtitle';

export const DEFAULT_PIPELINE_STAGES: PipelineStageInfo[] = [
  {
    id: 'upload',
    label: 'ဗီဒီယို/အသံဖိုင် လက်ခံခြင်း',
    description: 'မူရင်းဖိုင်ကို မပြုပြင်ဘဲ ဆာဗာပေါ်သို့ လုံခြုံစွာ လက်ခံသိမ်းဆည်းနေပါသည်',
    status: 'pending',
  },
  {
    id: 'validate_file',
    label: 'အသံနှင့် ဗီဒီယို Timeline စစ်ဆေးခြင်း (A/V Sync & Integrity)',
    description: 'FFprobe ဖြင့် A/V Offset, VFR, Sample Rate နှင့် ကြာချိန်ကို စစ်ဆေးနေပါသည်',
    status: 'pending',
  },
  {
    id: 'extract_audio',
    label: 'အသံထုတ်ယူခြင်းနှင့် အသံအရည်အသွေး စစ်ဆေးခြင်း (16kHz PCM WAV)',
    description: 'Loudness (LUFS), Noise Floor (dB) နှင့် Clipping တို့ကို စစ်ဆေးနေပါသည်',
    status: 'pending',
  },
  {
    id: 'detect_language',
    label: 'မူရင်းဘာသာစကားနှင့် Phoneme Aligner စစ်ဆေးခြင်း',
    description: 'ပြောကြားထားသော ဘာသာစကားနှင့် Phoneme Forced Alignment အသင့်ရှိမှု စစ်ဆေးနေပါသည်',
    status: 'pending',
  },
  {
    id: 'speech_recognition',
    label: 'Multi-Pass အသံမှ စာသားထုတ်ယူခြင်း (Pass A–E · Groq whisper-large-v3)',
    description: 'Multi-Pass ASR ဖြင့် စာသား၊ Segment နှင့် Word ID များကို အတည်ပြုနေပါသည်',
    status: 'pending',
  },
  {
    id: 'vad_alignment',
    label: 'Phoneme Forced Alignment နှင့် Adaptive VAD ချိန်ညှိခြင်း',
    description: 'Phoneme/Word နယ်နိမိတ်နှင့် Adaptive VAD အသံတိတ်ချိန်ကို တိုက်ဆိုင်စစ်ဆေးနေပါသည်',
    status: 'pending',
  },
  {
    id: 'generate_segments',
    label: 'Iterative Boundary Refinement နှင့် မူရင်းအချိန်မှတ်တမ်း သိမ်းဆည်းခြင်း',
    description: 'မူရင်းအချိန်မှတ်တမ်း (Original Timestamps) ကို မပြောင်းလဲဘဲ သီးခြားမှတ်တမ်းတင်နေပါသည်',
    status: 'pending',
  },
  {
    id: 'translate_gemini',
    label: 'Context-Aware မြန်မာဘာသာပြန်ခြင်း (Gemini 3.1 Pro · Translation Layer)',
    description: 'အချိန်မှတ်တမ်းနှင့် သီးခြားခွဲထုတ်ပြီး သဘာဝကျသော မြန်မာယူနီကုဒ်သို့ ပြန်ဆိုနေပါသည်',
    status: 'pending',
  },
  {
    id: 'validate_timing',
    label: 'Final Quality Assurance (QA) စစ်ဆေးခြင်း',
    description: 'စာတန်းထိုး၊ အသံတိတ်ချိန်နှင့် ဘာသာပြန် အရည်အသွေးကို နောက်ဆုံးအဆင့် စစ်ဆေးနေပါသည်',
    status: 'pending',
  },
  {
    id: 'generate_srt',
    label: 'SRT / VTT / ASS စာတန်းထိုးဖိုင် ထုတ်လုပ်ခြင်း',
    description: 'UTF-8 မြန်မာယူနီကုဒ် SRT, VTT နှင့် ASS စာတန်းထိုးဖိုင်များ အသင့်ဖြစ်ပါပြီ',
    status: 'pending',
  },
];

export const DEFAULT_SETTINGS: AppSettings = {
  thinkingMode: true,
  modelName: 'gemini-3.1-pro-preview',
  transcriptionEngine: 'whisper-hybrid',
  videoCategory: 'general',
  timingMode: 'exact_speech',
  processingMode: 'maximum_accuracy',
  translationStyle: 'conversational',
  maxLinesPerSubtitle: 2,
  maxCharsPerLine: 42,
  maxCps: 22,
  minDurationSec: 0.6,
  maxDurationSec: 6.5,
  maxUploadSizeMb: 250,
  chunkDurationSec: 180,
  chunkOverlapSec: 2.0,
  autoCleanupTempFiles: true,
  preserveCharacterNames: true,
  glossaryTerms: [
    { source: 'Yangon', burmese: 'ရန်ကုန်' },
    { source: 'Bagan', burmese: 'ပုဂံ' },
    { source: 'Irrawaddy', burmese: 'ဧရာဝတီ' },
    { source: 'Artificial Intelligence', burmese: 'ဉာဏ်ရည်တုနည်းပညာ' },
    { source: 'Documentary', burmese: 'မှတ်တမ်းရုပ်ရှင်' },
  ],
  characterMemory: [],
  subtitleStyle: {
    fontSize: 'md',
    textColor: '#FEF3C7',
    bgOpacity: 70,
    outlineStyle: 'box',
  },
};

// Zero demo jobs per user requirement ("Demo တွေတစ်ခုမှမပါစေနဲ့")
export const INITIAL_DEMO_JOBS: ProcessingJob[] = [];
