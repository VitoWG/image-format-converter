# Image Format Converter — Pro (Offline bundle)

This build is **100% offline**: no external CDNs or libraries. It uses vanilla JavaScript and a tiny built-in ZIP (store) writer.

## Features
- Convert to **PNG / JPEG / WebP / AVIF*** (browser support dependent)
- Resize (pixels or percentage) with optional aspect lock
- Rotate, flip H/V
- **Manual crop editor** (drag/resize handles) + presets (1:1, 4:3, 16:9, 9:16, social aspect choices)
- **Watermarks**: text + **logo upload**
- **Enhance**: contrast/exposure (auto-enhance toggle), **sharpen**
- **Queue** with per-item convert, reordering (up/down)
- **Convert All (ZIP)** using a store-only ZIP writer
- Dark mode toggle
- Everything runs locally

> *Note on AVIF support*: exporting AVIF depends on your browser's `canvas.toBlob('image/avif')` support. If unsupported, try WebP or PNG.

> *Metadata (EXIF) passthrough*: This offline build does not include EXIF read/write. If you need EXIF, I can generate a variant that bundles a small EXIF utility and preserves orientation + selected tags.

## Deploy (GitHub Pages in `/docs`)
1. Unzip this package.
2. Upload the **`docs/`** folder to your repo root (branch `main`).
3. Repo **Settings → Pages** → Source: `main` / Folder: `/docs` → Save.
4. Visit: `https://YOUR_USERNAME.github.io/YOUR_REPOSITORY/`

Enjoy!
