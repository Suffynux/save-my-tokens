# PDF → Markdown for Claude

A tiny, no-database tool that converts a PDF (or Word / PowerPoint / Excel / CSV /
HTML) into clean Markdown using **[Microsoft MarkItDown](https://github.com/microsoft/markitdown)**.
Paste the Markdown into Claude instead of uploading the raw file — same content,
far fewer tokens.

- **Frontend** — Next.js (App Router), static, glassmorphism dark UI.
- **Backend** — a single Python serverless function (`api/markitdown.py`) that runs
  MarkItDown on demand. No database, no auth, no persistent storage.


## How it works

1. The browser sends the raw file bytes to `POST /api/markitdown`
   (filename in the `X-Filename` header).
2. The Python function writes it to a temp file, runs MarkItDown, returns
   `{ "markdown": "..." }`, and deletes the temp file.
3. The UI shows the Markdown with a token estimate, **Copy**, and **Download .md**.

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. In Vercel: **New Project → import the repo → Deploy** (no env vars needed).
3. Vercel detects Next.js for the frontend and installs `requirements.txt`
   (`markitdown`) for the Python function automatically.

That's it — the live URL serves both the UI and the converter.

## Local development

`npm run dev` only runs the Next.js frontend; it does **not** run the Python
function. To test the full flow locally, use the Vercel CLI (it emulates the
Python runtime):

```bash
npm i -g vercel
vercel dev
```

Then open the printed `localhost` URL.

## Limitations

- **Max file size: 4.5 MB** — the Vercel Hobby serverless request body limit.
- **Text PDFs only** — scanned / image-only PDFs have no extractable text, so
  they return an error (MarkItDown does no OCR by default).

## Project layout

```
app/
  page.tsx          UI (client component)
  page.module.css   styles
  globals.css       theme
api/
  markitdown.py     Python serverless function (the converter)
  requirements.txt  Python dependency: markitdown (must live beside the function)
vercel.json         function memory / timeout
```
