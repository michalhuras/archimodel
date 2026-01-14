import { normalizeLayerName } from './utils.js';

export async function loadApartments() {
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
    header.innerHTML =
      "<th>Name</th><th>Price</th><th>Price/m²</th><th>Area</th><th>Floor</th><th>State</th><th>Layer</th>"
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
