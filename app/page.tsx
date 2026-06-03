"use client";

import { useCallback, useRef, useState } from "react";
import styles from "./page.module.css";

const ACCEPT = ".pdf,.docx,.pptx,.xlsx,.csv,.html,.htm,.txt,.md";
const MAX_BYTES = 4_500_000; // Vercel Hobby serverless body limit.

type Status = "idle" | "converting" | "done" | "error";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [markdown, setMarkdown] = useState("");
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const convert = useCallback(async (file: File) => {
    setFileName(file.name);
    setError("");
    setMarkdown("");
    setCopied(false);

    if (file.size > MAX_BYTES) {
      setStatus("error");
      setError(
        `That file is ${formatSize(file.size)}. The free serverless limit is 4.5 MB — try a smaller PDF.`,
      );
      return;
    }

    setStatus("converting");
    try {
      const res = await fetch("/api/markitdown", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Filename": encodeURIComponent(file.name),
        },
        body: file,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Conversion failed.");
      setMarkdown(data.markdown);
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) convert(file);
    },
    [convert],
  );

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) convert(file);
      e.target.value = "";
    },
    [convert],
  );

  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, [markdown]);

  const download = useCallback(() => {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName.replace(/\.[^.]+$/, "") + ".md";
    a.click();
    URL.revokeObjectURL(url);
  }, [markdown, fileName]);

  const reset = useCallback(() => {
    setStatus("idle");
    setMarkdown("");
    setError("");
    setFileName("");
  }, []);

  const charCount = markdown.length;
  const tokenEstimate = Math.ceil(charCount / 4);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <span className={styles.badge}>Microsoft MarkItDown</span>
        <h1 className={styles.title}>PDF → Markdown for Claude</h1>
        <p className={styles.subtitle}>
          Drop a document, get clean Markdown. Paste that into Claude instead of the
          raw file — fewer tokens, lower cost, same content.
        </p>
      </header>

      <section className={styles.card}>
        {status === "idle" || status === "error" ? (
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
              <path d="M12 15V3" />
              <path d="m7 8 5-5 5 5" />
              <path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
            </svg>
            <div className={styles.dropTitle}>Drag &amp; drop your file here</div>
            <div className={styles.dropHint}>
              PDF, Word, PowerPoint, Excel, CSV, HTML · up to 4.5 MB
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
        ) : (
          <div className={styles.fileRow}>
            {status === "converting" ? (
              <span className={styles.spinner} aria-hidden />
            ) : null}
            <div className={styles.fileInfo}>
              <span className={styles.fileName}>{fileName}</span>
              <span className={styles.fileMeta}>
                {status === "converting" ? "Converting…" : "Converted"}
              </span>
            </div>
            <span className={styles.spacer} />
            {status === "done" ? (
              <button className={styles.btn} onClick={reset}>
                New file
              </button>
            ) : null}
          </div>
        )}

        {status === "error" ? <div className={styles.error}>{error}</div> : null}

        {status === "done" && markdown ? (
          <div style={{ marginTop: 18 }}>
            <div className={styles.resultHead}>
              <div className={styles.stats}>
                <span>{charCount.toLocaleString()} characters</span>
                <span>≈ {tokenEstimate.toLocaleString()} tokens</span>
              </div>
              <div className={styles.actions}>
                <button className={styles.btn} onClick={download}>
                  Download .md
                </button>
                <button className={styles.btnPrimary + " " + styles.btn} onClick={copy}>
                  {copied ? "Copied ✓" : "Copy Markdown"}
                </button>
              </div>
            </div>
            <textarea
              className={styles.output}
              value={markdown}
              readOnly
              spellCheck={false}
            />
          </div>
        ) : null}
      </section>

      <footer className={styles.footer}>
        Runs entirely on{" "}
        <a href="https://github.com/microsoft/markitdown" target="_blank" rel="noreferrer">
          Microsoft MarkItDown
        </a>
        . Your file is processed on-demand and never stored.
      </footer>
    </main>
  );
}
