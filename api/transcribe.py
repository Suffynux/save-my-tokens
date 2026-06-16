"""Vercel Python serverless function.

Transcribes a short voice note into plain text using the free, keyless
Google Web Speech endpoint exposed through the `SpeechRecognition` library.

The browser decodes whatever audio the user supplies, downmixes it to a
single channel, resamples it to 16 kHz, encodes it as 16-bit PCM WAV, and
POSTs those raw bytes as the request body. The desired language is passed in
the `X-Lang` header as a BCP-47 tag such as `en-US`.

Sending audio that is already 16 kHz / 16-bit / mono means `SpeechRecognition`
performs no sample-rate or sample-width conversion server-side: it only runs
the bundled `flac` binary and posts the result. That keeps this function free
of an ffmpeg dependency.
"""

import io
import json
from http.server import BaseHTTPRequestHandler

import speech_recognition as sr

# Reused across warm invocations.
_recognizer = sr.Recognizer()

# Vercel Hobby serverless functions cap the request body at ~4.5 MB. At
# 16 kHz / 16-bit / mono that is roughly two and a half minutes of audio,
# which comfortably covers a "small voice note".
MAX_BYTES = 4_500_000


class handler(BaseHTTPRequestHandler):
    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0:
                return self._json(400, {"error": "No audio was uploaded."})
            if length > MAX_BYTES:
                return self._json(
                    413,
                    {"error": "Audio is larger than the 4.5 MB serverless limit. Try a shorter note."},
                )

            data = self.rfile.read(length)
            language = self.headers.get("X-Lang", "en-US") or "en-US"

            # The body is a 16 kHz / 16-bit / mono PCM WAV produced by the
            # browser, so AudioFile reads it without any conversion.
            with sr.AudioFile(io.BytesIO(data)) as source:
                audio = _recognizer.record(source)

            try:
                text = _recognizer.recognize_google(audio, language=language)
            except sr.UnknownValueError:
                return self._json(
                    422,
                    {"error": "Could not make out any speech. Try a clearer recording or a quieter background."},
                )
            except sr.RequestError as exc:
                return self._json(
                    502,
                    {"error": f"The speech service was unreachable: {exc}"},
                )

            text = (text or "").strip()
            if not text:
                return self._json(
                    422,
                    {"error": "No speech was detected in that audio."},
                )

            return self._json(200, {"text": text, "language": language})
        except Exception as exc:  # noqa: BLE001 — surface a clean message to the client
            return self._json(500, {"error": f"Transcription failed: {exc}"})
