import { normalizeLayerName, colorForState, fetchJson, highlightApartmentsByLayer } from './utils.js';
import { getHiddenLayers, setOnFilterChange, openApartmentDetailsByLayer } from './apartments.js';
import { t } from './i18n.js';

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

  const compassImg = document.getElementById("spritespin-compass")

  if (!toggleLayersBtn) return

  const spritespinContainer = document.getElementById("spritespin-viewer")
  let spritespinOverlaySvg = null
  const spritespinOverlayPaths = new Map()
  let spritespinSelectedLayer = null
  let spritespinHoveredLayer = null
  let spritespinCurrentFrameIndex = 0
  let spritespinLayersEnabled = true

  window.addEventListener("apartment-modal-closed", () => {
    spritespinSelectedLayer = null
    highlightApartmentsByLayer("")
    renderSpritespinOverlay({ frameIndex: spritespinCurrentFrameIndex })
  })

  window.addEventListener("apartment-row-hover", (e) => {
    spritespinHoveredLayer = e?.detail?.layerName || null
    renderSpritespinOverlay({ frameIndex: spritespinCurrentFrameIndex })
  })

  window.addEventListener("apartment-row-hover-end", () => {
    spritespinHoveredLayer = null
    renderSpritespinOverlay({ frameIndex: spritespinCurrentFrameIndex })
  })

  function ensureSpritespinOverlaySvg(overlays) {
    if (!spritespinContainer || !overlays) return null
    spritespinContainer.classList.add('spritespin-container')

    if (spritespinOverlaySvg) return spritespinOverlaySvg

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    svg.setAttribute("width", "100%")
    svg.setAttribute("height", "100%")
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet")
    svg.classList.add('spritespin-overlay-svg')

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
        pathEl.classList.add('spritespin-overlay-path')

        pathEl.addEventListener("mouseenter", () => {
          highlightApartmentsByLayer(layerName)
        })

        pathEl.addEventListener("mouseleave", () => {
          if (spritespinSelectedLayer) {
            highlightApartmentsByLayer(spritespinSelectedLayer)
          } else {
            highlightApartmentsByLayer("")
          }
        })

        pathEl.addEventListener("click", () => {
          spritespinSelectedLayer = layerName
          openApartmentDetailsByLayer(layerName)
          renderSpritespinOverlay({ frameIndex: spritespinCurrentFrameIndex })
        })

        svg.appendChild(pathEl)
        spritespinOverlayPaths.set(layerName, pathEl)
      }

      pathEl.setAttribute("d", shape.d)
      pathEl.setAttribute("fill", col)
      const isActive = spritespinSelectedLayer === layerName || spritespinHoveredLayer === layerName
      pathEl.setAttribute("fill-opacity", isActive ? "0.32" : "0.22")
      pathEl.setAttribute("stroke", col)
      pathEl.setAttribute("stroke-opacity", "0.9")
      pathEl.setAttribute("stroke-width", isActive ? "4" : "2")
      pathEl.classList.add('spritespin-overlay-path')
      pathEl.style.display = 'block'
    }
  }

  let entries = []
  let idx = 0
  let currentDims = null
  let playTimer = null
  const urlCache = new Map()
  let spritespinActive = false
  let resizeTimer = null

  function updateCompass(frameIndex) {
    if (!compassImg) return
    const total = entries.length || 0
    if (total <= 0) return
    const clamped = Math.max(0, Math.min(total - 1, Number(frameIndex) || 0))
    const angleDeg = (clamped / total) * 360
    compassImg.classList.add('spritespin-compass')
    compassImg.style.transform = `rotate(${-angleDeg}deg)`
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

  function getSpritespinStage() {
    return document.querySelector(".spritespin-stage")
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

  function getSpriteSpinDimensions() {
    const spritespinStage = getSpritespinStage()
    const bounds = spritespinStage?.getBoundingClientRect()
    const width = Math.max(240, Math.floor(bounds?.width || 0))
    const height = Math.max(240, Math.floor(bounds?.height || width))
    const size = Math.max(240, Math.min(width, height))
    return { width: size, height: size }
  }

  function initSpriteSpin() {
    const spEl = document.getElementById("spritespin-viewer")
    if (!spEl) throw new Error("Missing #spritespin-viewer")
    if (!window.jQuery || !window.jQuery.fn?.spritespin) {
      throw new Error("SpriteSpin library not loaded")
    }

    const dims = getSpriteSpinDimensions()
    if (
      currentDims &&
      currentDims.width === dims.width &&
      currentDims.height === dims.height &&
      window.jQuery(spEl).data("spritespin")
    ) {
      return
    }

    const frameUrls = entries.map((e) => makeUrl(e.name, e.bytes))
    const $sp = window.jQuery(spEl)
    if ($sp.data("spritespin")) {
      $sp.spritespin("destroy")
      $sp.empty()
    }

    currentDims = dims
    spritespinActive = true

    $sp.spritespin({
      source: frameUrls,
      width: dims.width,
      height: dims.height,
      sense: -1,
      frameTime: 60,
      animate: false,
      frame: spritespinCurrentFrameIndex,
      onFrameChanged: function (e, data) {
        const frame = Number(data?.frame) || 0
        spritespinCurrentFrameIndex = frame
        updateCompass(frame)
        if (spritespinLayersEnabled) {
          renderSpritespinOverlay({ frameIndex: frame })
        }
      }
    })

    updateCompass(spritespinCurrentFrameIndex)
    renderSpritespinOverlay({ frameIndex: spritespinCurrentFrameIndex })
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
      currentDims = null
      updateControls()

      const res = await fetch(ZIP_URL)
      if (!res.ok) throw new Error(`ZIP download failed (${res.status})`)

      const buf = await res.arrayBuffer()
      const u8 = new Uint8Array(buf)

      if (!window.fflate?.unzipSync) {
        throw new Error(t('errors.requestFailed'))
      }

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
        updateControls()
        return
      }

      updateControls()

      await ensureOverlayGlobals()

      try {
        initSpriteSpin()
      } catch (e) {
        spritespinActive = false
      }

      updateControls()
    } catch {
      updateControls()
    }
  }

  setOnFilterChange(() => {
    renderSpritespinOverlay({ frameIndex: spritespinCurrentFrameIndex })
  })

  const resizeObserver = new ResizeObserver(() => {
    if (!entries.length) return
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      try {
        initSpriteSpin()
      } catch {
      }
    }, 120)
  })

  const spritespinStage = getSpritespinStage()
  if (spritespinStage) {
    resizeObserver.observe(spritespinStage)
  }

  setTimeout(() => {
    try {
      loadZipAndInitSpriteSpin()
    } catch {
    }
  }, 0)
}
