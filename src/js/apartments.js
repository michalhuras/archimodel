import { normalizeLayerName } from './utils.js';

let hideSold = false
let apartmentsData = []
let onFilterChangeCallback = null

export function setOnFilterChange(callback) {
  onFilterChangeCallback = callback
}

export function getHiddenLayers() {
  if (!hideSold) return []
  return apartmentsData
    .filter(a => a.state?.toLowerCase() === 'sold')
    .map(a => normalizeLayerName(a.layer_name))
    .filter(Boolean)
}

function renderTable(el, apartments) {
  const filtered = hideSold 
    ? apartments.filter(a => a.state?.toLowerCase() !== 'sold')
    : apartments

  el.innerHTML = ''

  const toggleBtn = document.createElement('button')
  toggleBtn.textContent = hideSold ? 'Present sold' : 'Hide sold'
  toggleBtn.style.cssText = 'margin-bottom: 12px; padding: 8px 16px; font-size: 13px; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; cursor: pointer;'
  toggleBtn.addEventListener('click', () => {
    hideSold = !hideSold
    renderTable(el, apartmentsData)
    if (onFilterChangeCallback) onFilterChangeCallback()
  })
  el.appendChild(toggleBtn)

  const table = document.createElement('table')
  table.style.cssText = 'width: 100%; border-collapse: collapse; font-size: 13px;'

  const header = document.createElement('tr')
  header.innerHTML = '<th>Name</th><th>Price</th><th>Price/m²</th><th>Area</th><th>Floor</th><th>State</th><th>Layer</th>'
  header.querySelectorAll('th').forEach(th => {
    th.style.cssText = 'border: 1px solid #e5e7eb; padding: 8px; text-align: center; background: #f9fafb; font-weight: 600;'
  })
  table.appendChild(header)

  for (const a of filtered) {
    const row = document.createElement('tr')
    const layer = normalizeLayerName(a.layer_name)
    if (layer) row.dataset.layer = layer

    row.innerHTML = `<td>${a.name ?? ''}</td><td>${a.price ?? ''}</td><td>${a.price_per_square_metre ?? ''}</td><td>${a.area ?? ''}</td><td>${a.floor ?? ''}</td><td>${a.state ?? ''}</td><td>${a.layer_name ?? ''}</td>`
    row.querySelectorAll('td').forEach(td => {
      td.style.cssText = 'border: 1px solid #e5e7eb; padding: 8px; text-align: center;'
    })
    table.appendChild(row)
  }

  el.appendChild(table)
}

export async function loadApartments() {
  const el = document.getElementById('apartments')

  try {
    const res = await fetch('/.netlify/functions/apartment')
    if (!res.ok) throw new Error('Request failed')
    const apartments = await res.json()

    if (!Array.isArray(apartments) || apartments.length === 0) {
      el.textContent = 'No apartments'
      return
    }

    apartmentsData = apartments
    renderTable(el, apartments)
  } catch (e) {
    el.textContent = 'Failed to load apartments'
  }
}
