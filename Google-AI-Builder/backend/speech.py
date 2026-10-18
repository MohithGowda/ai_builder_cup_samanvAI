import base64
import os
import time
from functools import lru_cache
from threading import Lock

import httpx
from fastapi import HTTPException


LANGUAGES = ("en-IN", "hi-IN", "kn-IN")
_requests: dict[str, list[float]] = {}
_lock = Lock()


def capabilities():
    return {"configured": os.getenv("GOOGLE_CLOUD_TTS_ENABLED", "false").lower() == "true", "provider": "Google Cloud Text-to-Speech", "languages": list(LANGUAGES), "stores_audio": False, "notice": "Cloud audio needs enabled Text-to-Speech API, billing and server Application Default Credentials. Configured does not mean credentials have been verified."}


def access_token():
    import google.auth
    from google.auth.transport.requests import Request

    credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    if not credentials.valid:
        credentials.refresh(Request())
    return credentials.token


@lru_cache(maxsize=3)
def select_cloud_voice(language: str):
    response = httpx.get("https://texttospeech.googleapis.com/v1/voices", params={"languageCode": language}, headers={"Authorization": f"Bearer {access_token()}"}, timeout=15)
    response.raise_for_status()
    voices = [voice for voice in response.json().get("voices", []) if language in voice.get("languageCodes", [])]
    if not voices:
        raise HTTPException(503, "No Google voice is currently available for this language")
    voices.sort(key=lambda voice: (voice.get("ssmlGender") != "MALE", "Neural2" not in voice["name"], "Wavenet" not in voice["name"]))
    return voices[0]["name"]


def synthesize(text: str, language: str, citizen_id: str) -> bytes:
    if not capabilities()["configured"]:
        raise HTTPException(503, "Google Cloud speech is not configured. Use an available device voice or typed replies.")
    if language not in LANGUAGES or not text.strip() or len(text.encode("utf-8")) > 4500:
        raise HTTPException(422, "Choose a supported language and at most 4500 UTF-8 bytes of speech text")
    now = time.monotonic()
    with _lock:
        for user in list(_requests):
            _requests[user] = [stamp for stamp in _requests[user] if now - stamp < 60]
            if not _requests[user]:
                del _requests[user]
        if len(_requests.get(citizen_id, [])) >= 16:
            raise HTTPException(429, "Speech request limit reached. Please try again in a minute.")
        if citizen_id not in _requests and len(_requests) >= 2048:
            raise HTTPException(503, "Speech service is busy. Please retry later.")
        _requests.setdefault(citizen_id, []).append(now)
    try:
        voice = select_cloud_voice(language)
        response = httpx.post("https://texttospeech.googleapis.com/v1/text:synthesize", headers={"Authorization": f"Bearer {access_token()}"}, json={"input": {"text": text}, "voice": {"languageCode": language, "name": voice}, "audioConfig": {"audioEncoding": "MP3", "speakingRate": 0.95}}, timeout=20)
        response.raise_for_status()
        audio = base64.b64decode(response.json()["audioContent"], validate=True)
        if not audio:
            raise ValueError("Empty cloud audio")
        return audio
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Google speech is unavailable. Check API enablement, billing and server credentials, or use a device voice.") from None