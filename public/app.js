if (localStorage.getItem("auth") !== "ok") {
  window.location.href = "/login.html"
}

function normalizeLayerName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
}

window.__highlightApartmentsByLayer = function (layerName) {
  const key = normalizeLayerName(layerName)
  const rows = document.querySelectorAll("#apartments table tr[data-layer]")
  for (const r of rows) {
    const match = key && r.dataset.layer === key
    r.style.background = match ? "rgba(99, 102, 241, 0.18)" : ""
    r.style.outline = match ? "2px solid rgba(99, 102, 241, 0.45)" : ""
  }
}

async function loadApartments() {
  const el = document.getElementById("apartments")

  try {
    const res = await fetch("/.netlify/functions/apartment")
    if (!res.ok) throw new Error("Request failed")
    const apartments = await res.json()

    if (!Array.isArray(apartments) || apartments.length === 0) {
      el.textContent = "No apartments"
      return
    }

    const table = document.createElement("table")
    const header = document.createElement("tr")
    header.innerHTML = "<th>Name</th><th>Price</th><th>Price/m²</th><th>Area</th><th>Floor</th><th>State</th><th>Layer</th>"
    table.appendChild(header)

    for (const a of apartments) {
      const row = document.createElement("tr")
      const layer = normalizeLayerName(a.layer_name)
      if (layer) row.dataset.layer = layer

      row.innerHTML = `<td>${a.name ?? ""}</td><td>${a.price ?? ""}</td><td>${a.price_per_square_metre ?? ""}</td><td>${a.area ?? ""}</td><td>${a.floor ?? ""}</td><td>${a.state ?? ""}</td><td>${a.layer_name ?? ""}</td>`
      table.appendChild(row)
    }

    el.textContent = ""
    el.appendChild(table)
  } catch (e) {
    el.textContent = "Failed to load apartments"
  }
}

function logout() {
  localStorage.removeItem("auth")
  window.location.href = "/login.html"
}

loadApartments()

;(() => {
  const ZIP_BASE_URL = "https://pub-bd8c5d894c334dbfa30341d1d4208c04.r2.dev"
  const ZIP_FILE_NAME = "render_webp.zip"
  const ZIP_URL = "/.netlify/functions/renders-zip"

  function colorForState(state) {
    const st = String(state || "").toLowerCase()
    if (st === "selling") return "#86efac" // pastel green
    if (st === "sold") return "#fca5a5" // pastel red
    if (st === "reserved") return "#fdba74" // pastel orange
    return "#93c5fd" // pastel blue fallback
  }

  async function fetchJson(url) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Request failed: ${url} (${res.status})`)
    return await res.json()
  }

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

      // If apartments are missing/empty, fall back to whatever exists at frame 0
      if (tmp.size === 0) {
        const perLayer0 = overlays?.frames?.["0"] || {}
        for (const layer of Object.keys(perLayer0)) {
          tmp.set(layer, "#93c5fd")
        }
      }

      window.__layerToColor = tmp
    } catch (e) {
      // Keep the page usable even if overlays fail to load.
      console.warn("Failed to init overlay globals", e)
    }
  }

  const loadBtn = document.getElementById("renders-load")
  const prevBtn = document.getElementById("renders-prev")
  const nextBtn = document.getElementById("renders-next")
  const playBtn = document.getElementById("renders-play")
  const toggleLayersBtn = document.getElementById("spritespin-toggle-layers")
  const statusEl = document.getElementById("renders-status")
  const imgEl = document.getElementById("renders-img")
  const emptyEl = document.getElementById("renders-empty")

  if (!loadBtn || !prevBtn || !nextBtn || !playBtn || !toggleLayersBtn || !statusEl || !imgEl || !emptyEl) return

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

    for (const [, p] of spritespinOverlayPaths.entries()) {
      p.style.display = "none"
    }

    for (const [layerName, col] of layerColors.entries()) {
      const shape = perLayer[layerName]
      if (!shape || !shape.d) continue

      let pathEl = spritespinOverlayPaths.get(layerName)
      if (!pathEl) {
        pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path")
        pathEl.style.cursor = "pointer"
        pathEl.style.pointerEvents = "auto"

        pathEl.addEventListener("click", () => {
          spritespinSelectedLayer = layerName
          if (typeof window.__highlightApartmentsByLayer === "function") {
            window.__highlightApartmentsByLayer(layerName)
          }
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
  let currentUrl = null
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
    prevBtn.disabled = !has
    nextBtn.disabled = !has
    playBtn.disabled = !has
    toggleLayersBtn.disabled = !has
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

  function show(i) {
    if (!entries.length) return
    idx = ((i % entries.length) + entries.length) % entries.length
    const e = entries[idx]

    const url = makeUrl(e.name, e.bytes)
    if (currentUrl && currentUrl !== url) {
      // keep cached urls; cleanup later
    }
    currentUrl = url

    currentDims = null
    imgEl.onload = () => {
      try {
        const w = imgEl.naturalWidth
        const h = imgEl.naturalHeight
        if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
          currentDims = { w, h }
          setStatus(`${idx + 1}/${entries.length} - ${e.name}`)
        }
      } catch {
        // ignore
      }
    }

    imgEl.src = url
    imgEl.style.display = "block"
    emptyEl.style.display = "none"
    setStatus(`${idx + 1}/${entries.length} - ${e.name}`)

    const keep = [e.name]
    const prev = entries[(idx - 1 + entries.length) % entries.length]?.name
    const next = entries[(idx + 1) % entries.length]?.name
    if (prev) keep.push(prev)
    if (next) keep.push(next)
    cleanupUrls(keep)

    updateControls()
  }

  function togglePlay() {
    if (!entries.length) return
    if (playTimer) {
      clearInterval(playTimer)
      playTimer = null
      updateControls()
      return
    }
    playTimer = setInterval(() => {
      show(idx + 1)
    }, 800)
    updateControls()
  }

  prevBtn.onclick = () => show(idx - 1)
  nextBtn.onclick = () => show(idx + 1)
  playBtn.onclick = () => togglePlay()

  loadBtn.onclick = async () => {
    try {
      loadBtn.disabled = true
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
        // ignore
      }

      entries = []
      idx = 0
      imgEl.style.display = "none"
      emptyEl.style.display = "block"
      emptyEl.textContent = "Loading ZIP..."
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
      const files = window.fflate.unzipSync(u8)

      const list = []
      for (const [name, bytes] of Object.entries(files)) {
        if (!isImageName(name)) continue
        list.push({ name, bytes })
      }

      list.sort((a, b) => a.name.localeCompare(b.name))

      entries = list
      if (!entries.length) {
        emptyEl.textContent = "ZIP loaded, but no images found"
        setStatus("No images in ZIP")
        updateControls()
        return
      }

      await ensureOverlayGlobals()

      // Initialize SpriteSpin using all frames.
      try {
        const spEl = document.getElementById("spritespin-viewer")
        if (!spEl) throw new Error("Missing #spritespin-viewer")
        if (!window.jQuery || !window.jQuery.fn?.spritespin) {
          throw new Error("SpriteSpin library not loaded")
        }

        // Create stable URLs for all frames.
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

        // Render overlay for initial frame.
        renderSpritespinOverlay({ frameIndex: 0 })
      } catch (e) {
        // If SpriteSpin fails, keep the single-image viewer working.
        spritespinActive = false
      }

      emptyEl.textContent = ""
      show(0)
    } catch (e) {
      emptyEl.style.display = "block"
      emptyEl.textContent = "Failed to load ZIP"
      const msg = String(e?.message || e)
      const hint =
        msg.includes("Failed to fetch") || msg.includes("Network")
          ? "Hint: open the proxy endpoint directly to see the upstream error: /.netlify/functions/renders-zip"
          : ""
      setStatus([msg, hint].filter(Boolean).join(" | "))
      updateControls()
    } finally {
      loadBtn.disabled = false
    }
  }

  // Auto-load ZIP on page load
  setTimeout(() => {
    try {
      loadBtn.click()
    } catch {
      // ignore
    }
  }, 0)
})()
