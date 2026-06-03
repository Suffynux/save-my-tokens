# PDF to Markdown

An open source tool that converts a PDF, Word, PowerPoint, Excel, CSV, or HTML
file into clean Markdown using [Microsoft MarkItDown](https://github.com/microsoft/markitdown).
Paste the Markdown into Claude, ChatGPT, Gemini, or any text based AI instead of
uploading the raw file. You keep the same content but use far fewer tokens, which
lowers your cost.

This project is free to use, free to fork, and free to deploy. You do not need to
write any code to run your own copy. All you need is a Vercel account.

## What it does

The browser reads your file and sends the raw bytes to a small Python function.
That function runs MarkItDown, returns the Markdown, and deletes the temporary
file. The page then shows the Markdown with a token estimate, a copy button, and a
download button. There is no database, no sign in, and nothing is stored.

## Deploy your own copy

You can have a live version running in a few minutes.

1. Create a free account at [vercel.com](https://vercel.com).
2. Fork this repository to your own GitHub account using the Fork button at the
   top of the GitHub page.
3. In Vercel, click New Project and import the repository you just forked.
4. Click Deploy. You do not need to set any environment variables.

Vercel detects the Next.js frontend and installs the Python dependency in
`api/requirements.txt` automatically. When the build finishes you get a live URL
that serves both the interface and the converter.

Every time you push a change to your fork, Vercel rebuilds and updates the live
site for you.

## Make changes

The project is small and the files are easy to find. To see what each file does,
read [DOCS.md](DOCS.md), which describes every module in plain language.

Common edits:

1. Change the wording, headings, or layout in `app/page.tsx`.
2. Change the colours, spacing, or theme in `app/page.module.css` and
   `app/globals.css`.
3. Change the browser tab icon in `app/icon.tsx`.
4. Change the conversion behaviour or the file size limit in `api/markitdown.py`.

After you edit a file, commit and push it to your fork and Vercel deploys the new
version on its own.

## Keep the docs current

When you change how a module works, update its description so the documentation
stays accurate.

1. Open [DOCS.md](DOCS.md) and find the section for the file you changed.
2. Update the text to match the new behaviour.
3. If you added a new file, add a short section for it under the matching heading.
4. Commit and push together with your code change so the two never drift apart.

## Run it on your own machine

Running `npm run dev` starts the Next.js frontend but does not run the Python
function. To test the full conversion flow locally, use the Vercel command line
tool, which emulates the Python runtime:

```bash
npm i -g vercel
vercel dev
```

Then open the printed localhost address.

## Limits

The maximum file size is 4.5 megabytes, which is the Vercel Hobby serverless body
limit. Only documents with extractable text are supported. Scanned or image only
PDFs return an error because MarkItDown does not perform optical character
recognition by default. If a file is too large, try splitting the PDF into smaller
parts and converting each one.

## Project layout

```
app/
  layout.tsx        root layout, fonts, metadata, and the theme script
  page.tsx          the interface (client component)
  page.module.css   styles for the page
  globals.css       theme variables
  icon.tsx          generated browser tab icon
api/
  markitdown.py     Python serverless function that runs the conversion
  requirements.txt  Python dependency, markitdown, must sit beside the function
next.config.ts      Next.js configuration
vercel.json         function memory and timeout
DOCS.md             full description of every module
```

## License

This project is open source. You are free to use it, change it, and deploy it.
