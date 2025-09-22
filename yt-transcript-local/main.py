import re
import urllib.parse
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse, Response
from youtube_transcript_api import (
    NoTranscriptFound,
    TranscriptsDisabled,
    VideoUnavailable,
    YouTubeTranscriptApi,
)

APP_TITLE = "YT Transcript Local API"
APP_VERSION = "1.1"
HOST = "127.0.0.1"
PORT = 17653  # keep in sync with index.html

app = FastAPI(title=APP_TITLE, version=APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_pna_header(request: Request, call_next):
    response: Response = await call_next(request)
    if request.method == "OPTIONS":
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


ID_RE = re.compile(r"^[a-zA-Z0-9_-]{11}$")


def extract_video_id(url_or_id: str) -> str:
    s = (url_or_id or "").strip()
    if not s:
        raise HTTPException(status_code=400, detail="Missing url or videoId")
    if ID_RE.match(s):
        return s
    try:
        u = urllib.parse.urlparse(s)
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=400, detail="Invalid URL") from exc

    host = (u.hostname or "").lower().replace("www.", "")
    path = u.path or ""
    qs = urllib.parse.parse_qs(u.query or "")

    if host == "youtu.be":
        segs = [p for p in path.split("/") if p]
        if segs and ID_RE.match(segs[0]):
            return segs[0]

    if host.endswith("youtube.com") or host.endswith("youtube-nocookie.com"):
        if path == "/watch":
            v = (qs.get("v") or [None])[0]
            if v and ID_RE.match(v):
                return v
        segs = [p for p in path.split("/") if p]
        if len(segs) >= 2 and segs[0] in ("shorts", "embed", "live"):
            if ID_RE.match(segs[1]):
                return segs[1]

    raise HTTPException(status_code=400, detail="Could not extract videoId")


def to_plain_text(snippets: List[dict]) -> str:
    lines = []
    for snip in snippets:
        text = (snip.get("text") or "").strip()
        if text:
            lines.append(text)
    return "\n".join(lines).strip()


def to_segments(snippets: List[dict]) -> List[dict]:
    segments: List[dict] = []
    for idx, snip in enumerate(snippets):
        start = float(snip.get("start", 0.0))
        duration_value = snip.get("duration")
        duration = float(duration_value) if duration_value is not None else 0.0
        text = (snip.get("text") or "").strip()

        if duration <= 0 and idx + 1 < len(snippets):
            next_start = float(snippets[idx + 1].get("start", start))
            duration = max(0.0, next_start - start)
        end = start + duration if duration > 0 else start

        segments.append(
            {
                "index": idx,
                "start": round(start, 3),
                "end": round(end, 3),
                "duration": round(duration, 3),
                "text": text,
            }
        )
    return segments


@app.get("/api/ping")
def ping():
    return {"ok": True, "service": APP_TITLE, "version": APP_VERSION}


@app.get("/api/tracks")
def get_tracks(
    url: Optional[str] = Query(default=None, description="YouTube share URL"),
    videoId: Optional[str] = Query(default=None, description="11-char video id"),
):
    vid = videoId or (extract_video_id(url) if url else None)
    if not vid:
        raise HTTPException(status_code=400, detail="Provide ?url= or ?videoId=")

    try:
        transcript_api = YouTubeTranscriptApi()
        tlist = transcript_api.list(vid)
    except TranscriptsDisabled as exc:
        raise HTTPException(status_code=403, detail="Transcripts disabled for this video") from exc
    except VideoUnavailable as exc:
        raise HTTPException(status_code=404, detail="Video unavailable") from exc
    except NoTranscriptFound as exc:
        raise HTTPException(status_code=404, detail="No transcripts available") from exc

    tracks = []
    for transcript in tlist:
        track = {
            "lang": getattr(transcript, "language_code", None),
            "language": getattr(transcript, "language", None),
            "name": getattr(transcript, "language", None),
            "isGenerated": getattr(transcript, "is_generated", None),
            "isTranslatable": getattr(transcript, "is_translatable", None),
            "translationLanguages": getattr(transcript, "translation_languages", []),
            "source": "yt-transcript-local",
        }
        tracks.append(track)

    return {"videoId": vid, "tracks": tracks}


@app.get("/api/transcript")
def get_transcript(
    url: Optional[str] = Query(default=None, description="YouTube share URL"),
    videoId: Optional[str] = Query(default=None, description="11-char video id"),
    lang: str = Query(default="en", description="comma separated languages"),
    prefer_asr: bool = Query(default=False, description="prefer autogenerated captions"),
    format: str = Query(default="segments", description="segments or txt"),
    preserve_formatting: bool = Query(default=False, description="keep <i>/<b> if true"),
):
    vid = videoId or (extract_video_id(url) if url else None)
    if not vid:
        raise HTTPException(status_code=400, detail="Provide ?url= or ?videoId=")

    langs = [x.strip() for x in lang.split(",") if x.strip()]
    try:
        transcript_api = YouTubeTranscriptApi()
        transcript_list = transcript_api.list(vid)
        transcript = None

        if not prefer_asr:
            try:
                transcript = transcript_list.find_manually_created_transcript(langs)
            except Exception:  # pragma: no cover - fallback
                transcript = None
        if transcript is None:
            try:
                transcript = transcript_list.find_generated_transcript(langs)
            except Exception:  # pragma: no cover - fallback
                transcript = None
        if transcript is None:
            transcript = transcript_list.find_transcript(langs)

        fetched = transcript.fetch(preserve_formatting=preserve_formatting)
        raw = (
            [dict(s) for s in fetched.to_raw_data()]
            if hasattr(fetched, "to_raw_data")
            else fetched
        )

        if format == "txt":
            text = to_plain_text(raw)
            if not text:
                raise HTTPException(status_code=502, detail="Empty transcript returned")
            return PlainTextResponse(text, headers={"Cache-Control": "public, max-age=86400"})

        segments = to_segments(raw)
        return JSONResponse(
            {
                "videoId": vid,
                "language": getattr(transcript, "language_code", None),
                "languageName": getattr(transcript, "language", None),
                "generated": getattr(transcript, "is_generated", None),
                "source": "yt-transcript-local",
                "segments": segments,
            },
            headers={"Cache-Control": "public, max-age=86400"},
        )

    except TranscriptsDisabled as exc:
        raise HTTPException(status_code=403, detail="Transcripts disabled for this video") from exc
    except NoTranscriptFound as exc:
        raise HTTPException(status_code=404, detail="No transcript found for requested languages") from exc
    except VideoUnavailable as exc:
        raise HTTPException(status_code=404, detail="Video unavailable") from exc
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail=f"Unexpected error: {exc}") from exc
