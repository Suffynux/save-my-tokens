# Module Documentation

This document describes every module in the project, what it does, and how the
pieces fit together. The application is a small toolbox of token-saving helpers
for AI work. The first tool converts a document such as a PDF into clean Markdown
so it can be pasted into an AI tool using far fewer tokens. The second tool turns
a short voice note into plain text. The two tools share one theme and a top nav
that switches between them.

## Overview

The project has two halves. The frontend is a Next.js App Router application that
renders the user interface and handles file selection. The backend is a single
Python serverless function that runs Microsoft MarkItDown to perform the actual
conversion. There is no database, no authentication, and no persistent storage.

The request flow is straightforward. The browser reads the chosen file, sends the
raw bytes to the Python function, receives Markdown back as JSON, and shows it in
the page with a copy button and a download button.

## Frontend modules

### app/layout.tsx

The root layout. It loads three fonts (Geist Sans, Geist Mono, and Pacifico for
the script signature) and exposes them as CSS variables. It defines the page
title and description used for the browser tab and search results. It also injects
a small inline script that runs before the first paint. That script reads the saved
theme from local storage, or falls back to the system colour preference, and sets
it on the html element so the page never flashes the wrong theme on load.

### app/page.tsx

The main client component and the only screen in the app. It owns all interface
state including the current status (idle, converting, done, or error), the
returned Markdown, the file name, the drag state, and the active theme. Its
responsibilities are:

1. Accept a file by drag and drop or by the file picker.
2. Reject files larger than 4.5 megabytes before any upload, since that is the
   serverless body limit.
3. Send the file to POST /api/markitdown and place the filename in the X-Filename
   header.
4. Display the resulting Markdown together with a character count and a rough
   token estimate, computed as characters divided by four.
5. Offer Copy to clipboard and Download as a .md file.
6. Toggle between light and dark themes and remember the choice in local storage.

### app/voice/page.tsx

The voice-note-to-text screen, served at `/voice`. It is a client component that
reuses the same styles, theme toggle, and layout as the home page. Its job is to
turn a short voice note into the exact words as plain text. It can take audio two
ways: a live recording from the microphone using the browser MediaRecorder, or an
uploaded audio file by drag and drop or the file picker. The user first chooses
the spoken language from a dropdown, which defaults to English (US).

Whichever way the audio arrives, the page prepares it entirely in the browser
before sending. It decodes the audio with the Web Audio API, downmixes it to a
single channel, resamples it to 16 kHz using an OfflineAudioContext, and encodes
the result as a 16-bit PCM WAV. Sending audio in exactly that shape means the
Python backend needs no ffmpeg. The WAV bytes are posted to POST /api/transcribe
with the chosen language in the X-Lang header. The returned text is shown with a
word and character count, a Copy button, and a Download as .txt button. Anything
longer than the 4.5 megabyte serverless limit (about two and a half minutes) is
rejected with a clear message before upload.

### app/voice/layout.tsx

A tiny server component that wraps the voice page. Because the voice page is a
client component it cannot export route metadata itself, so this layout exports
the page title and description used for the browser tab and search results, then
renders its children unchanged.

### app/page.module.css

The scoped styles shared by both screens. It contains the layout, the card, the
drop zone, the result area, the footer, the theme toggle button, and the
signature, plus the tool-switcher nav and the voice controls (language dropdown
and record button). The signature uses a left to right gradient that runs from
purple through pink to orange. The favicon reuses these same three colours.

### app/globals.css

The global theme. It declares the colour variables for both the dark and light
themes and applies the base typography and background. The data-theme attribute on
the html element selects which set of variables is active.

### app/icon.tsx

Generates the browser tab icon at build time using the ImageResponse helper from
next/og. The icon is an italic letter S monogram drawn on the same purple to pink
to orange gradient as the footer signature, so the brand colour is consistent
across the page and the tab. Because Next.js cannot generate a favicon.ico from
code, this file replaces the old favicon and Next.js wires up the correct link tag
automatically.

## Backend module

### api/markitdown.py

The Vercel Python serverless function that performs the conversion. It exposes a
standard handler class with a do_POST method. The steps are:

1. Read the Content-Length header and reject an empty body or a body larger than
   the 4.5 megabyte limit.
2. Read the raw bytes and recover the original filename from the X-Filename
   header so the file extension is known.
3. Write the bytes to a temporary file with the matching extension, run MarkItDown
   on it, then delete the temporary file in a finally block so nothing is left on
   disk.
4. Return the Markdown as JSON. If no text could be extracted, which happens with
   scanned or image only files, it returns a clear error instead.

A single MarkItDown converter instance is created once at module load and reused
across warm invocations to avoid repeated setup cost.

### api/transcribe.py

The Vercel Python serverless function that performs voice transcription. It
exposes a handler class with a do_POST method. The steps are:

1. Read the Content-Length header and reject an empty body or a body larger than
   the 4.5 megabyte limit.
2. Read the raw bytes, which are a 16 kHz, 16-bit, mono WAV already prepared by
   the browser, and read the requested language from the X-Lang header.
3. Hand the WAV to the SpeechRecognition library and call the free, keyless Google
   Web Speech endpoint with that language.
4. Return the recognised words as JSON. If no speech is made out it returns a
   clear error, and if the speech service is unreachable it says so.

Because the audio arrives already at 16 kHz and 16 bit, SpeechRecognition does no
sample-rate or width conversion: it only runs the flac binary it ships with and
posts the result. That is why this function needs no ffmpeg. A single Recognizer
instance is created once at module load and reused across warm invocations.

### api/requirements.txt

Lists the Python dependencies: markitdown for the document converter and
SpeechRecognition for the voice transcriber. Vercel installs these when it builds
the Python functions. The file must live beside the functions it serves.

## Configuration

### next.config.ts

The Next.js configuration. It sets devIndicators to false, which hides the on
screen development indicator. That indicator is the floating Next.js logo shown
during local development that reports the framework version.

### vercel.json

Sets the memory and the maximum duration for the two Python functions. It grants
each of them 1024 megabytes of memory and a 60 second timeout so larger documents
have room to convert and transcription has room to finish.

### package.json

Declares the Node dependencies (Next.js, React, and React DOM) and the scripts.
The dev script runs the Next.js frontend only. The build script produces the
production build. The start script serves that build. The lint script runs ESLint.

## Running locally

Running npm run dev starts the Next.js frontend but does not run the Python
function. To exercise the full conversion flow on your own machine, use the Vercel
command line tool, which emulates the Python runtime:

```bash
npm i -g vercel
vercel dev
```

Then open the printed localhost address.

## Limits

The maximum file size is 4.5 megabytes, set by the Vercel Hobby serverless request
body limit. Only documents with extractable text are supported. Scanned or image
only PDFs return an error because MarkItDown does not perform optical character
recognition by default.
