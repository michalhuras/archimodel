# ArchiModel

Interactive 360° viewer for residential developments. Rotate a rendered model of the building, see every apartment highlighted on it, and browse, filter and sort them in a synced table.

<!-- Replace with a recording of the viewer, see doc/media/README.md -->
![ArchiModel demo](doc/media/demo.gif)

## Features

- **360° model view** - pre-rendered frames of the building played with SpriteSpin, rotated by dragging.
- **Apartment overlays** - each apartment is drawn on top of the render and colored by status (available / reserved / sold). Overlays follow the rotation and hide when occluded.
- **Two-way highlighting** - hovering an apartment on the model highlights its row in the table, and hovering a row highlights the apartment on the model.
- **Details on click** - clicking an apartment opens a modal with its price, price per m², area, floor and status.
- **Filtering and sorting** - range filters for price, price per m², area and floor, a toggle for sold units, and sorting. Filters apply to the model too.
- **Compass** that rotates with the view, plus a button to show or hide all overlays.
- **i18n** - English and Polish.
- **Responsive layout** for desktop and mobile.

## How it works

```text
3D model (3ds Max)
  ├── renders from N cameras ──► render_webp.zip ──► 360° view (SpriteSpin)
  └── export to FBX ──► precompute-layer-overlays.mjs ──► layer-overlays.json ──► SVG overlays
apartments.json ───────────────────────────────────────────────────────────────► table + overlay colors
```

1. The building is modelled in 3ds Max. Every apartment is a separate layer (for example `kondygnacja_01`).
2. Frames are rendered from a ring of cameras and packed into a ZIP of `.webp` images. The browser downloads and unpacks it with `fflate`.
3. The same scene, with the cameras, is exported to FBX. The preprocessing script projects every apartment layer through every camera with three.js, computes its 2D outline, checks occlusion and saves the result to `layer-overlays.json`.
4. `apartments.json` holds the sales data. Each apartment points to its model layer through `layer_name`.
5. Netlify Functions serve the data, the logo and the renders. The frontend is plain JavaScript bundled with webpack.

## Tech stack

- Vanilla JavaScript, HTML and CSS bundled with webpack and Babel
- [SpriteSpin](https://github.com/giniedp/spritespin) for the 360° view, [fflate](https://github.com/101arrowz/fflate) for unpacking renders
- [three.js](https://threejs.org/) (FBX/OBJ loaders) for overlay preprocessing in Node
- Netlify (hosting + Functions), Cloudflare R2 for static assets

## Getting started

Requirements: Node.js 18+ and the [Netlify CLI](https://docs.netlify.com/cli/get-started/) (`npm i -g netlify-cli`).

```bash
npm install
npm run dev     # Netlify Dev + webpack watch with live reload
npm run build   # production build into dist/
```

## Using your own model

1. **Renders** - render the building from evenly spaced cameras and export the frames as `.webp` (sorted by file name). Pack and host them as described in [Deployment](#deployment).
2. **Overlays** - export the scene with the same cameras to FBX and run:

   ```bash
   node scripts/precompute-layer-overlays.mjs --camerasFbx "data/model.fbx" --fovDeg 73 --occlusionEps 2
   ```

   - `--fovDeg` - camera field of view. It must match the renderer so overlays line up with the frames.
   - `--occlusionEps` - occlusion tolerance, which controls when a layer counts as visible.
   - `--listCameraCandidates` - lists cameras found in the FBX file.
   - `--out`, `--width`, `--height`, `--apartments` - output path, frame size, apartments file.

   Supported inputs are `.fbx` and `.obj`. The native 3ds Max `.max` format can't be read and has to be exported first. Source models go in `data/`, which is git-ignored.
3. **Apartments** - edit [netlify/functions/apartments.json](netlify/functions/apartments.json):

   ```json
   {
     "name": "Apartment A1",
     "price": 2500000,
     "price_per_square_metre": 27778,
     "area": 90,
     "floor": 1,
     "state": "selling",
     "layer_name": "kondygnacja_01"
   }
   ```

   `state` is one of `selling`, `reserved`, `sold`.
4. **Logo** - an SVG uploaded to the bucket together with the renders, see [Deployment](#deployment).

## Deployment

The site and the functions are hosted on Netlify. Large static files (renders and the logo) live in a storage bucket (Cloudflare R2) and are proxied by Netlify Functions, so the bucket URL never reaches the browser.

### 1. Build the bucket bundle

```bash
npm run build:assets
# or with explicit inputs:
node scripts/build-assets.mjs --renders data/biurowiec/render_webp --logo data/icon.svg
```

This creates `build/bucket/` (git-ignored) with everything the bucket needs:

| File | Content | Served by |
|---|---|---|
| `render_webp.zip` | 360° frames as `render_webp/<frame>.webp`, stored uncompressed (frames are already compressed) | [renders-zip.js](netlify/functions/renders-zip.js) |
| `icon.svg` | logo | [logo.js](netlify/functions/logo.js) |

Options:

- `--renders` - a directory with frames or an existing ZIP to repack (default `data/biurowiec/render_webp`). Repacking also fixes ZIPs made on Windows with `\` in entry paths.
- `--logo` - logo file (default `data/icon.svg`).
- `--out` - output directory (default `build/bucket`).
- `--overlays` - `layer-overlays.json` used to check that the number of frames matches `frameCount` (default `netlify/functions/layer-overlays.json`). A mismatch means the overlays will not line up with the renders.

### 2. Upload to the bucket

Upload both files to the bucket root, keeping their names. Use the Cloudflare dashboard (R2 → bucket → Upload) or Wrangler:

```bash
npx wrangler r2 object put <bucket>/render_webp.zip --file build/bucket/render_webp.zip --remote
npx wrangler r2 object put <bucket>/icon.svg --file build/bucket/icon.svg --remote
```

Expose the bucket through a custom domain (R2 → bucket → Settings → Custom Domains). The public `r2.dev` URL is meant for development only.

### 3. Point the functions to the bucket

The functions read the bucket URLs from environment variables. No URL is stored in the code.

| Variable | Used by | Value |
|---|---|---|
| `RENDERS_ZIP_URL` | [renders-zip.js](netlify/functions/renders-zip.js) | URL of `render_webp.zip` in the bucket |
| `LOGO_URL` | [logo.js](netlify/functions/logo.js) | URL of `icon.svg` in the bucket |
| `RENDERS_ZIP_PATH` | renders-zip.js | optional, local ZIP for development, e.g. `build/bucket/render_webp.zip` |
| `LOGO_PATH` | logo.js | optional, local SVG for development, e.g. `build/bucket/icon.svg` |

A local path takes precedence over the URL. If neither is set, the function returns a 500 error naming the missing variable.

- **Netlify:** set `RENDERS_ZIP_URL` and `LOGO_URL` in Site configuration → Environment variables before deploying.
- **Local:** copy [.env.example](.env.example) to `.env` and fill in either the URLs or the local paths, then restart `npm run dev`.

### 4. Deploy the site

Commit and push. `layer-overlays.json` and `apartments.json` in `netlify/functions/` must match the renders in the bucket, so upload the bundle before deploying data generated from a new model.

## Project structure

```text
src/                 frontend (index.html, style.css, js/, i18n/, assets/)
netlify/functions/   API endpoints and the JSON data they serve
scripts/             overlay preprocessing, bucket bundle, version generation, PNG to SVG converter
scripts/blender/     procedural test model (office building) with renders and cameras
doc/media/           screenshots and recordings for this README
```

## License

[MIT](LICENSE) © 2026 Michał Huras
