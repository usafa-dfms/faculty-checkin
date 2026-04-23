# assets

Drop `dfms-seal.png` here — it is referenced by `index.html` (login hero) and
`app.html` (header). A square PNG at 256×256 or larger works well; the login
page renders it at 120×120 and the app header at 44×44.

The HTML tolerates a missing file via `onerror="this.style.display='none'"`,
so the layout won't break if the file isn't present, but the page will look
much nicer with the seal in place.
