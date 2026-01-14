export function normalizeLayerName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
}

export function colorForState(state) {
  const st = String(state || "").toLowerCase()
  if (st === "selling") return "#86efac"
  if (st === "sold") return "#fca5a5"
  if (st === "reserved") return "#fdba74"
  return "#93c5fd"
}

export async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Request failed: ${url} (${res.status})`)
  return await res.json()
}

export function highlightApartmentsByLayer(layerName) {
  const key = normalizeLayerName(layerName)
  const rows = document.querySelectorAll("#apartments table tr[data-layer]")
  for (const r of rows) {
    const match = key && r.dataset.layer === key
    r.style.background = match ? "rgba(99, 102, 241, 0.18)" : ""
    r.style.outline = match ? "2px solid rgba(99, 102, 241, 0.45)" : ""
  }
}
