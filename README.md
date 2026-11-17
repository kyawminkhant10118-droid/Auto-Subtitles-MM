# MingalarSub Studio — AI Auto Subtitle & Burmese Translation Web App

A production-ready full-stack web application for automatic video/audio speech transcription, natural Myanmar (Burmese Unicode) localization via Google Gemini High Thinking (`gemini-4-carbon` with `ThinkingLevel.HIGH`), interactive NLE subtitle timeline editing, and UTF-8 `.srt` export.

## Core Architecture & Pipeline

```text
Upload File (.mp4, .mkv, .mov, .mp3, .wav, .m4a)
  → Validate File (Format, Size, & ffprobe Streams)
  → Extract Audio (FFmpeg 16kHz Mono PCM WAV + Chunking for Long Videos)
  → Detect Spoken Language Automatically
  → Speech Recognition (Acoustic Timestamped Transcription)
  → Generate Timestamped Segments
  → Translate with Gemini (gemini-4-carbon High Thinking into Natural Burmese Unicode)
  → Validate Subtitle Timing (Max 2 Lines, CPS Check, Chronological Overlap Resolution)
  → Generate SRT (UTF-8 with BOM for Burmese Unicode Compatibility)
  → Interactive Preview & Subtitle Editor
  → Download (.my.srt, Original .srt, or Bilingual .srt)
```

## Project Structure

- `/src/types/subtitle.ts` — Shared TypeScript interfaces for jobs, pipeline stages, segments, and timing diagnostics
- `/src/utils/subtitleUtils.ts` — Pure SRT timestamp formatting/parsing, line wrapping, overlap resolution, search & replace, and segment splitting
- `/src/utils/subtitleUtils.test.ts` — Unit test suite (`node:test`) verifying SRT round-trips, Burmese line wrapping, and timing normalization
- `/src/components/` — Modular React UI components (`DashboardView`, `GeneratorView`, `SubtitleEditorView`, `HistoryView`, `SettingsView`)
- `/server/services/ffmpegService.ts` — FFmpeg & `ffprobe` media validation, 16kHz mono WAV extraction, audio chunking, and temporary storage cleanup
- `/server/services/geminiService.ts` — Server-side `@google/genai` integration (`gemini-3.5-transcribe` + `gemini-4-carbon` with `ThinkingLevel.HIGH`)
- `/server.ts` — Unified full-stack Express + Vite server running on port 3000
- `/backend/main.py` & `/requirements.txt` — Companion Python FastAPI + Whisper + FFmpeg service

## Setup & Running Instructions

1. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and ensure `GEMINI_API_KEY` is configured (in AI Studio, set this via **Settings > Secrets**).
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Run Unit Tests**:
   ```bash
   npm test
   ```
4. **Start the Full-Stack Application**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.
