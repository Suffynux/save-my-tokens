"""Vercel Python serverless function.

Converts an uploaded document to Markdown using Microsoft's MarkItDown.
The browser POSTs the raw file bytes as the request body and passes the
original filename in the `X-Filename` header so MarkItDown can detect the
file type from its extension.
"""

import json
import os
import tempfile
from http.server import BaseHTTPRequestHandler
from urllib.parse import unquote

from markitdown import MarkItDown

# Reused across warm invocations.
_converter = MarkItDown(enable_plugins=False)

# Vercel Hobby serverless functions cap the request body at ~4.5 MB.
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
                return self._json(400, {"error": "No file was uploaded."})
            if length > MAX_BYTES:
                return self._json(
                    413,
                    {"error": "File is larger than the 4.5 MB serverless limit."},
                )

            data = self.rfile.read(length)
            filename = unquote(self.headers.get("X-Filename", "upload.pdf"))
            suffix = os.path.splitext(filename)[1].lower() or ".pdf"

            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp.write(data)
                tmp_path = tmp.name

            try:
                result = _converter.convert(tmp_path)
                markdown = (result.text_content or "").strip()
            finally:
                os.unlink(tmp_path)

            if not markdown:
                return self._json(
                    422,
                    {"error": "No text could be extracted (scanned or image-only file?)."},
                )

            return self._json(200, {"markdown": markdown, "filename": filename})
        except Exception as exc:  # noqa: BLE001 — surface a clean message to the client
            return self._json(500, {"error": f"Conversion failed: {exc}"})
