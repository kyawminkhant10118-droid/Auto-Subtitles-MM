"""
MingalarSub Studio — Python FastAPI + Whisper + FFmpeg + Gemini Backend Service
Provides standalone FastAPI endpoints for local Whisper + FFmpeg + Google GenAI Burmese translation.
"""
import os
import uuid
import shutil
import subprocess
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="MingalarSub AI Auto Subtitle & Burmese Translation API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_DIR = Path(os.getenv("TEMP_STORAGE_DIR", "./tmp"))
UPLOAD_DIR = TEMP_DIR / "uploads"
AUDIO_DIR = TEMP_DIR / "audio"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".mp4", ".mkv", ".mov", ".mp3", ".wav", ".m4a"}


class SubtitleSegmentModel(BaseModel):
    id: str
    index: int
    startTime: float
    endTime: float
    originalText: str
    translatedText: str
    speaker: Optional[str] = None


def extract_audio_ffmpeg(input_path: Path, output_wav: Path) -> None:
    """Extracts 16kHz mono PCM WAV from video/audio using FFmpeg."""
    cmd = [
        "ffmpeg", "-y", "-i", str(input_path),
        "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
        str(output_wav)
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"FFmpeg extraction error: {proc.stderr}")


def format_srt_timestamp(seconds: float) -> str:
    ms_total = int(round(max(0.0, seconds) * 1000))
    hours = ms_total // 3600000
    minutes = (ms_total % 3600000) // 60000
    secs = (ms_total % 60000) // 1000
    ms = ms_total % 1000
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{ms:03d}"


@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "ffmpeg": shutil.which("ffmpeg") is not None,
        "gemini_configured": bool(os.getenv("GEMINI_API_KEY")),
    }
