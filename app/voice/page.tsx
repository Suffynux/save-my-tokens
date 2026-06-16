"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "../page.module.css";

type Theme = "light" | "dark";
type Status = "idle" | "transcribing" | "done" | "error";

const TARGET_RATE = 16_000; // Matches what the speech backend expects.
const MAX_WAV_BYTES = 4_500_000; // Vercel Hobby serverless body limit.
const ACCEPT = "audio/*,.mp3,.wav,.m4a,.ogg,.webm,.aac,.flac";

const LANGUAGES: { code: string; label: string }[] = [
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "es-ES", label: "Spanish" },
  { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },
  { code: "it-IT", label: "Italian" },
  { code: "pt-BR", label: "Portuguese" },
  { code: "nl-NL", label: "Dutch" },
  { code: "hi-IN", label: "Hindi" },
  { code: "ur-PK", label: "Urdu" },
  { code: "ar-SA", label: "Arabic" },
  { code: "ru-RU", label: "Russian" },
  { code: "tr-TR", label: "Turkish" },
  { code: "zh-CN", label: "Chinese (Mandarin)" },
  { code: "ja-JP", label: "Japanese" },
  { code: "ko-KR", label: "Korean" },
];

function writeString(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

// Encode mono float samples into a 16-bit PCM WAV blob.
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([view], { type: "audio/wav" });
}

// Decode any browser-supported audio, downmix to mono, resample to 16 kHz,
// then return a WAV blob the backend can transcribe without ffmpeg.
async function toWav(input: Blob): Promise<Blob> {
  const arrayBuffer = await input.arrayBuffer();
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const decodeCtx = new AudioCtx();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer);
  } finally {
    decodeCtx.close();
  }

  // One mono channel at the target rate; the destination down-mixes for us.
  const frames = Math.ceil(decoded.duration * TARGET_RATE);
  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  const offline = new OfflineCtx(1, frames, TARGET_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();

  return encodeWav(rendered.getChannelData(0), TARGET_RATE);
}

export default function Voice() {
  const [status, setStatus] = useState<Status>("idle");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [recording, setRecording] = useState(false);
  const [language, setLanguage] = useState("en-US");
  const [theme, setTheme] = useState<Theme>("dark");

  const inputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Pick up whatever the pre-paint script already set on <html>.
  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    // One-time sync from the pre-paint theme script; not a render-driven update.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (current === "light" || current === "dark") setTheme(current);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem("theme", next);
      } catch {
        // ignore storage errors (private mode, etc.)
      }
      return next;
    });
  }, []);

  const transcribe = useCallback(
    async (audio: Blob, name: string) => {
      setSourceName(name);
      setError("");
      setText("");
      setCopied(false);
      setStatus("transcribing");

      try {
        const wav = await toWav(audio);
        if (wav.size > MAX_WAV_BYTES) {
          setStatus("error");
          setError(
            "That note is too long for the free serverless limit (~2.5 min). Try a shorter clip.",
          );
          return;
        }

        const res = await fetch("/api/transcribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-Lang": language,
          },
          body: wav,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Transcription failed.");
        setText(data.text);
        setStatus("done");
      } catch (err) {
        setStatus("error");
        setError(
          err instanceof Error
            ? err.message
            : "Could not read that audio. Try a different file.",
        );
      }
    },
    [language],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) transcribe(file, file.name);
    },
    [transcribe],
  );

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) transcribe(file, file.name);
      e.target.value = "";
    },
    [transcribe],
  );

  const startRecording = useCallback(async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        setRecording(false);
        if (blob.size > 0) transcribe(blob, "Voice recording");
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setStatus("error");
      setError(
        "Microphone access was blocked. Allow it in your browser, or upload an audio file instead.",
      );
    }
  }, [transcribe]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, [text]);

  const download = useCallback(() => {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const base = sourceName.replace(/\.[^.]+$/, "") || "transcript";
    a.download = `${base}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [text, sourceName]);

  const reset = useCallback(() => {
    setStatus("idle");
    setText("");
    setError("");
    setSourceName("");
  }, []);

  const charCount = text.length;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <main className={styles.page}>
      <button
        className={styles.themeToggle}
        onClick={toggleTheme}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {theme === "dark" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </button>

      <header className={styles.header}>
        <nav className={styles.nav}>
          <Link className={styles.navLink} href="/">
            Documents → Markdown
          </Link>
          <Link className={`${styles.navLink} ${styles.navLinkActive}`} href="/voice">
            Voice → Text
          </Link>
        </nav>
        <span className={styles.badge}>Voice to text</span>
        <h1 className={styles.title}>Voice notes to text</h1>
        <p className={styles.subtitle}>
          Record a quick voice note or drop an audio file and get the exact words
          back as plain text. Paste the transcript into Claude, ChatGPT, Gemini, or
          any AI tool — or just keep it. Pick the language you spoke in below.
        </p>
      </header>

      <section className={styles.card}>
        {status === "idle" || status === "error" ? (
          <>
            <div className={styles.controls}>
              <label className={styles.field}>
                Spoken language
                <select
                  className={styles.select}
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>

              <button
                className={`${styles.recordBtn} ${recording ? styles.recording : ""}`}
                onClick={recording ? stopRecording : startRecording}
              >
                {recording ? (
                  <>
                    <span className={styles.recordDot} aria-hidden />
                    Stop &amp; transcribe
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
                    </svg>
                    Record voice note
                  </>
                )}
              </button>
            </div>

            <div className={styles.controls}>
              <span className={styles.orDivider}>or upload a file</span>
            </div>

            <div
              className={`${styles.dropzone} ${dragging ? styles.dragging : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <svg
                className={styles.icon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
              <div className={styles.dropTitle}>Drag &amp; drop an audio file</div>
              <div className={styles.dropHint}>
                MP3, WAV, M4A, OGG, WEBM · short notes up to ~2.5 min
              </div>
              <button
                className={styles.browseBtn}
                onClick={() => inputRef.current?.click()}
              >
                Choose file
              </button>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                hidden
                onChange={onPick}
              />
            </div>
          </>
        ) : (
          <div className={styles.fileRow}>
            {status === "transcribing" ? (
              <span className={styles.spinner} aria-hidden />
            ) : null}
            <div className={styles.fileInfo}>
              <span className={styles.fileName}>{sourceName}</span>
              <span className={styles.fileMeta}>
                {status === "transcribing" ? "Transcribing…" : "Transcribed"}
              </span>
            </div>
            <span className={styles.spacer} />
            {status === "done" ? (
              <button className={styles.btn} onClick={reset}>
                New note
              </button>
            ) : null}
          </div>
        )}

        {status === "error" ? <div className={styles.error}>{error}</div> : null}

        {status === "done" && text ? (
          <div style={{ marginTop: 18 }}>
            <div className={styles.resultHead}>
              <div className={styles.stats}>
                <span>{wordCount.toLocaleString()} words</span>
                <span>{charCount.toLocaleString()} characters</span>
              </div>
              <div className={styles.actions}>
                <button className={styles.btn} onClick={download}>
                  Download .txt
                </button>
                <button className={styles.btnPrimary + " " + styles.btn} onClick={copy}>
                  {copied ? "Copied ✓" : "Copy text"}
                </button>
              </div>
            </div>
            <textarea
              className={styles.output}
              value={text}
              readOnly
              spellCheck={false}
            />
          </div>
        ) : null}
      </section>

      <section className={styles.info}>
        <div className={styles.infoBlock}>
          <h2 className={styles.infoTitle}>What it does</h2>
          <p className={styles.infoText}>
            It listens to your voice note and writes down the exact words. Record
            straight from your microphone or upload an audio file you already have.
            The audio is prepared in your browser and sent for transcription on
            demand — nothing is stored.
          </p>
        </div>

        <div className={styles.infoBlock}>
          <h2 className={styles.infoTitle}>Languages</h2>
          <p className={styles.infoText}>
            Start with English, or pick another language from the list before you
            record or upload. Choosing the right language helps the transcription
            get the words and spelling right. More languages can be added easily.
          </p>
        </div>

        <div className={styles.infoBlock}>
          <h2 className={styles.infoTitle}>How to use it</h2>
          <ol className={styles.infoList}>
            <li>Pick the language you are speaking.</li>
            <li>Press record and talk, then stop — or upload an audio file.</li>
            <li>Wait a moment while it transcribes.</li>
            <li>Copy the text or download it as a .txt file.</li>
          </ol>
        </div>

        <div className={styles.infoBlock}>
          <h2 className={styles.infoTitle}>Tips for accuracy</h2>
          <p className={styles.infoText}>
            Speak clearly and keep background noise low. Short, single-speaker notes
            work best. Very long recordings hit the free serverless size limit, so
            split a long note into a few shorter clips.
          </p>
        </div>
      </section>

      <footer className={styles.footer}>
        <div>
          Transcribed on-demand with the free Google Web Speech service. Your audio
          is processed live and never stored.
        </div>
        <div className={styles.credit}>
          Developed by{" "}
          <a
            className={styles.signature}
            href="https://suffynux.me/"
            target="_blank"
            rel="noreferrer"
          >
            Sufiyan
          </a>
        </div>
      </footer>
    </main>
  );
}
