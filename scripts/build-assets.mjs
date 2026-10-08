/**
 * Builds the static asset bundle that is uploaded to the storage bucket (Cloudflare R2):
 *
 *   build/bucket/
 *     render_webp.zip   360° frames, entries render_webp/<frame> sorted by name
 *     icon.svg          logo served by netlify/functions/logo.js
 *
 * Usage:
 *   node scripts/build-assets.mjs [--renders <dir|zip>] [--logo <file>] [--out <dir>] [--overlays <json>]
 *
 * --renders   directory with frames or an existing ZIP to repack (default: data/biurowiec/render_webp)
 * --logo      logo SVG (default: data/icon.svg)
 * --out       output directory (default: build/bucket)
 * --overlays  layer-overlays.json used to check the frame count (default: netlify/functions/layer-overlays.json)
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { unzipSync, zipSync } from "fflate"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, "..")

const IMAGE_RE = /\.(webp|png|jpe?g)$/i
const ZIP_NAME = "render_webp.zip"
const ZIP_DIR = "render_webp"
const LOGO_NAME = "icon.svg"

function parseArgs(argv) {
  const args = {
    renders: "data/biurowiec/render_webp",
    logo: "data/icon.svg",
    out: "build/bucket",
    overlays: "netlify/functions/layer-overlays.json"
  }
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, "")
    if (!(key in args)) throw new Error(`Unknown option: ${argv[i]}`)
    args[key] = argv[++i]
  }
  for (const k of Object.keys(args)) args[k] = path.resolve(repoRoot, args[k])
  return args
}

/** Returns [{ name, bytes }] for every frame, sorted the same way the frontend sorts them. */
function readFrames(source) {
  if (!fs.existsSync(source)) throw new Error(`Renders not found: ${source}`)

  let frames
  if (fs.statSync(source).isDirectory()) {
    frames = fs
      .readdirSync(source)
      .filter((n) => IMAGE_RE.test(n))
      .map((name) => ({ name, bytes: fs.readFileSync(path.join(source, name)) }))
  } else {
    const files = unzipSync(fs.readFileSync(source))
    frames = Object.entries(files)
      .filter(([n]) => IMAGE_RE.test(n))
      // Normalise Windows-style entries such as "render_webp\\render 01.webp".
      .map(([n, bytes]) => ({ name: n.split(/[\\/]/).pop(), bytes }))
  }

  if (!frames.length) throw new Error(`No frames (.webp/.png/.jpg) in ${source}`)
  const exts = new Set(frames.map((f) => path.extname(f.name).toLowerCase()))
  if (exts.size > 1) throw new Error(`Mixed frame formats in ${source}: ${[...exts].join(", ")}`)

  return frames.sort((a, b) => a.name.localeCompare(b.name))
}

function checkFrameCount(frames, overlaysPath) {
  if (!fs.existsSync(overlaysPath)) {
    console.warn(`! ${path.relative(repoRoot, overlaysPath)} not found, skipping frame count check`)
    return
  }
  const expected = Number(JSON.parse(fs.readFileSync(overlaysPath, "utf8")).frameCount)
  if (Number.isFinite(expected) && expected !== frames.length) {
    console.warn(
      `! Frame count mismatch: ${frames.length} frames vs frameCount=${expected} in ${path.relative(repoRoot, overlaysPath)}.` +
        " Overlays will not line up with the renders."
    )
  }
}

function formatSize(bytes) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}

function main() {
  const args = parseArgs(process.argv)

  const frames = readFrames(args.renders)
  checkFrameCount(frames, args.overlays)

  if (!fs.existsSync(args.logo)) throw new Error(`Logo not found: ${args.logo}`)

  fs.rmSync(args.out, { recursive: true, force: true })
  fs.mkdirSync(args.out, { recursive: true })

  // Frames are already compressed images, so store them without deflate.
  const entries = {}
  for (const f of frames) entries[`${ZIP_DIR}/${f.name}`] = [new Uint8Array(f.bytes), { level: 0 }]
  const zipPath = path.join(args.out, ZIP_NAME)
  fs.writeFileSync(zipPath, zipSync(entries))

  const logoPath = path.join(args.out, LOGO_NAME)
  fs.copyFileSync(args.logo, logoPath)

  console.log(`Bucket bundle: ${path.relative(repoRoot, args.out).split(path.sep).join("/")}/`)
  console.log(`  ${ZIP_NAME}  ${frames.length} frames, ${formatSize(fs.statSync(zipPath).size)}`)
  for (const f of frames) console.log(`    ${ZIP_DIR}/${f.name}`)
  console.log(`  ${LOGO_NAME}  ${formatSize(fs.statSync(logoPath).size)}`)
}

try {
  main()
} catch (e) {
  console.error(`Error: ${e.message}`)
  process.exit(1)
}
