import { normalizeLayerName, colorForState, fetchJson, highlightApartmentsByLayer } from './utils.js';
import { getHiddenLayers, setOnFilterChange } from './apartments.js';

const ZIP_BASE_URL = "https://pub-bd8c5d894c334dbfa30341d1d4208c04.r2.dev"
const ZIP_FILE_NAME = "render_webp.zip"
const ZIP_URL = "/.netlify/functions/renders-zip"

async function ensureOverlayGlobals() {
  if (window.__layerOverlaysData && window.__layerToColor) return

  try {
    const [overlays, apartments] = await Promise.all([
      fetchJson("/.netlify/functions/layer-overlays"),
      fetchJson("/.netlify/functions/apartment").catch(() => [])
    ])

    window.__layerOverlaysData = overlays

    const tmp = new Map()
    for (const a of Array.isArray(apartments) ? apartments : []) {
      const layer = normalizeLayerName(a.layer_name)
      if (!layer) continue
      if (!tmp.has(layer)) tmp.set(layer, colorForState(a.state))
    }

    if (tmp.size === 0) {
      const perLayer0 = overlays?.frames?.["0"] || {}
      for (const layer of Object.keys(perLayer0)) {
        tmp.set(layer, "#93c5fd")
      }
    }

    window.__layerToColor = tmp
  } catch (e) {
    console.warn("Failed to init overlay globals", e)
  }
}

export function initRenders() {
  const toggleLayersBtn = document.getElementById("spritespin-toggle-layers")
  const statusEl = document.getElementById("renders-status")

  if (!toggleLayersBtn || !statusEl) return

  const spritespinContainer = document.getElementById("spritespin-viewer")
  let spritespinOverlaySvg = null
  const spritespinOverlayPaths = new Map()
  let spritespinSelectedLayer = null
  let spritespinCurrentFrameIndex = 0
  let spritespinLayersEnabled = true

  function ensureSpritespinOverlaySvg(overlays) {
    if (!spritespinContainer || !overlays) return null
    spritespinContainer.style.position = "relative"

    if (spritespinOverlaySvg) return spritespinOverlaySvg

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    svg.setAttribute("width", "100%")
    svg.setAttribute("height", "100%")
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet")
    svg.style.position = "absolute"
    svg.style.left = "0"
    svg.style.top = "0"
    svg.style.width = "100%"
    svg.style.height = "100%"
    svg.style.pointerEvents = "none"
    svg.style.zIndex = "5"

    const w = overlays.width || 1100
    const h = overlays.height || 520
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`)

    spritespinContainer.appendChild(svg)
    spritespinOverlaySvg = svg
    return svg
  }

  function renderSpritespinOverlay({ angleDeg, frameIndex }) {
    if (!spritespinLayersEnabled) return
    const overlays = window.__layerOverlaysData
    const layerColors = window.__layerToColor
    if (!overlays || !layerColors) return

    const svg = ensureSpritespinOverlaySvg(overlays)
    if (!svg) return

    const framesObj = overlays.frames || {}
    const count = Number(overlays.frameCount) || Object.keys(framesObj).length
    const idx = Number.isFinite(frameIndex) ? frameIndex : 0
    const clamped = Math.max(0, Math.min(count - 1, idx))
    spritespinCurrentFrameIndex = clamped
    const perLayer = framesObj[String(clamped)] || {}

    const hiddenLayers = getHiddenLayers()

    for (const [, p] of spritespinOverlayPaths.entries()) {
      p.style.display = "none"
    }

    for (const [layerName, col] of layerColors.entries()) {
      const shape = perLayer[layerName]
      if (!shape || !shape.d) continue
      if (hiddenLayers.includes(layerName)) continue

      let pathEl = spritespinOverlayPaths.get(layerName)
      if (!pathEl) {
        pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path")
        pathEl.style.cursor = "pointer"
        pathEl.style.pointerEvents = "auto"

        pathEl.addEventListener("click", () => {
          spritespinSelectedLayer = layerName
          highlightApartmentsByLayer(layerName)
          renderSpritespinOverlay({ frameIndex: spritespinCurrentFrameIndex })
        })

        svg.appendChild(pathEl)
        spritespinOverlayPaths.set(layerName, pathEl)
      }

      pathEl.setAttribute("d", shape.d)
      pathEl.setAttribute("fill", col)
      pathEl.setAttribute("fill-opacity", "0.22")
      pathEl.setAttribute("stroke", col)
      pathEl.setAttribute("stroke-opacity", "0.9")
      pathEl.setAttribute("stroke-width", spritespinSelectedLayer === layerName ? "4" : "2")
      pathEl.style.display = "block"
    }
  }

  let entries = []
  let idx = 0
  let currentDims = null
  let playTimer = null
  const urlCache = new Map()
  let spritespinActive = false

  function setStatus(msg) {
    const base = msg || ""
    const dims = currentDims ? ` (${currentDims.w}×${currentDims.h})` : ""
    statusEl.textContent = base + dims
  }

  function isImageName(name) {
    return /\.(webp|png|jpe?g|gif)$/i.test(String(name || ""))
  }

  function makeUrl(name, bytes) {
    const cached = urlCache.get(name)
    if (cached) return cached

    const lower = String(name).toLowerCase()
    let type = "application/octet-stream"
    if (lower.endsWith(".webp")) type = "image/webp"
    else if (lower.endsWith(".png")) type = "image/png"
    else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) type = "image/jpeg"
    else if (lower.endsWith(".gif")) type = "image/gif"

    const blob = new Blob([bytes], { type })
    const url = URL.createObjectURL(blob)
    urlCache.set(name, url)
    return url
  }

  function cleanupUrls(keepNames) {
    if (spritespinActive) return
    const keep = new Set(keepNames)
    for (const [name, url] of urlCache.entries()) {
      if (!keep.has(name)) {
        URL.revokeObjectURL(url)
        urlCache.delete(name)
      }
    }
  }

  function updateControls() {
    const has = entries.length > 0
    toggleLayersBtn.disabled = !has
    const iconImg = toggleLayersBtn.querySelector("img")
    if (iconImg) {
      iconImg.src = spritespinLayersEnabled ? "/assets/icons/hide.svg" : "/assets/icons/show.svg"
    }
  }

  toggleLayersBtn.onclick = () => {
    spritespinLayersEnabled = !spritespinLayersEnabled
    if (spritespinOverlaySvg) {
      spritespinOverlaySvg.style.display = spritespinLayersEnabled ? "block" : "none"
    }
    if (spritespinLayersEnabled) {
      renderSpritespinOverlay({ frameIndex: spritespinCurrentFrameIndex })
    }
    updateControls()
  }

  async function loadZipAndInitSpriteSpin() {
    try {
      if (playTimer) {
        clearInterval(playTimer)
        playTimer = null
      }

      spritespinActive = false
      try {
        const spEl = document.getElementById("spritespin-viewer")
        if (spEl && window.jQuery) {
          const $sp = window.jQuery(spEl)
          if ($sp.data("spritespin")) {
            $sp.spritespin("destroy")
          }
          $sp.empty()
        }
      } catch {
      }

      entries = []
      idx = 0
      setStatus(`Downloading: ${ZIP_FILE_NAME}`)
      updateControls()

      const res = await fetch(ZIP_URL)
      if (!res.ok) throw new Error(`ZIP download failed (${res.status})`)

      const buf = await res.arrayBuffer()
      const u8 = new Uint8Array(buf)

      if (!window.fflate?.unzipSync) {
        throw new Error("ZIP library not loaded")
      }

      setStatus("Unzipping...")
      await new Promise((r) => setTimeout(r, 0))
      const files = window.fflate.unzipSync(u8)

      const list = []
      for (const [name, bytes] of Object.entries(files)) {
        if (!isImageName(name)) continue
        list.push({ name, bytes })
      }

      list.sort((a, b) => a.name.localeCompare(b.name))

      entries = list
      if (!entries.length) {
        setStatus("No images in ZIP")
        updateControls()
        return
      }

      setStatus(`Loaded ${entries.length} frames`)

      updateControls()

      await ensureOverlayGlobals()

      try {
        const spEl = document.getElementById("spritespin-viewer")
        if (!spEl) throw new Error("Missing #spritespin-viewer")
        if (!window.jQuery || !window.jQuery.fn?.spritespin) {
          throw new Error("SpriteSpin library not loaded")
        }

        const frameUrls = entries.map((e) => makeUrl(e.name, e.bytes))
        spritespinActive = true

        const $sp = window.jQuery(spEl)
        if ($sp.data("spritespin")) {
          $sp.spritespin("destroy")
          $sp.empty()
        }

        $sp.spritespin({
          source: frameUrls,
          width: Math.min($sp.width() || 520, 520),
          height: Math.min($sp.width() || 520, 520),
          sense: -1,
          frameTime: 60,
          animate: false,
          onFrameChanged: function (e, data) {
            const frame = Number(data?.frame) || 0
            spritespinCurrentFrameIndex = frame
            if (spritespinLayersEnabled) {
              renderSpritespinOverlay({ frameIndex: frame })
            }
          }
        })

        renderSpritespinOverlay({ frameIndex: 0 })
      } catch (e) {
        spritespinActive = false
      }

      updateControls()
    } catch (e) {
      const msg = String(e?.message || e)
      const hint =
        msg.includes("Failed to fetch") || msg.includes("Network")
          ? "Hint: open the proxy endpoint directly to see the upstream error: /.netlify/functions/renders-zip"
          : ""
      setStatus([msg, hint].filter(Boolean).join(" | "))
      updateControls()
    }
  }

  setOnFilterChange(() => {
    renderSpritespinOverlay({ frameIndex: spritespinCurrentFrameIndex })
  })

  setTimeout(() => {
    try {
      loadZipAndInitSpriteSpin()
    } catch {
    }
  }, 0)
}
