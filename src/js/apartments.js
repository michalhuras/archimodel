import { normalizeLayerName } from './utils.js';

let hideSold = false
let apartmentsData = []
let onFilterChangeCallback = null
let currentSort = null

const SORT_OPTIONS = [
  { key: 'price_asc', label: 'Price ↑', field: 'price', dir: 1 },
  { key: 'price_desc', label: 'Price ↓', field: 'price', dir: -1 },
  { key: 'price_m2_asc', label: 'Price/m² ↑', field: 'price_per_square_metre', dir: 1 },
  { key: 'price_m2_desc', label: 'Price/m² ↓', field: 'price_per_square_metre', dir: -1 },
  { key: 'area_asc', label: 'Area ↑', field: 'area', dir: 1 },
  { key: 'area_desc', label: 'Area ↓', field: 'area', dir: -1 },
  { key: 'floor_asc', label: 'Floor ↑', field: 'floor', dir: 1 },
  { key: 'floor_desc', label: 'Floor ↓', field: 'floor', dir: -1 },
  { key: 'name_asc', label: 'Name A-Z', field: 'name', dir: 1 },
  { key: 'name_desc', label: 'Name Z-A', field: 'name', dir: -1 }
]

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

function sortApartments(apartments) {
  if (!currentSort) return apartments
  const opt = SORT_OPTIONS.find(o => o.key === currentSort)
  if (!opt) return apartments

  return [...apartments].sort((a, b) => {
    const va = a[opt.field]
    const vb = b[opt.field]
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    if (typeof va === 'string') return va.localeCompare(vb) * opt.dir
    return (va - vb) * opt.dir
  })
}

function renderTable(el, apartments) {
  let filtered = hideSold 
    ? apartments.filter(a => a.state?.toLowerCase() !== 'sold')
    : apartments
  filtered = sortApartments(filtered)

  el.innerHTML = ''

  const toolbar = document.createElement('div')
  toolbar.style.cssText = 'display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;'

  const toggleBtn = document.createElement('button')
  toggleBtn.textContent = hideSold ? 'Show sold' : 'Hide sold'
  toggleBtn.style.cssText = 'padding: 8px 16px; font-size: 13px; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; cursor: pointer;'
  toggleBtn.addEventListener('click', () => {
    hideSold = !hideSold
    renderTable(el, apartmentsData)
    if (onFilterChangeCallback) onFilterChangeCallback()
  })
  toolbar.appendChild(toggleBtn)

  const sortWrapper = document.createElement('div')
  sortWrapper.style.cssText = 'position: relative;'

  const sortBtn = document.createElement('button')
  sortBtn.textContent = currentSort ? SORT_OPTIONS.find(o => o.key === currentSort)?.label || 'Sort' : 'Sort'
  sortBtn.style.cssText = 'padding: 8px 16px; font-size: 13px; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; cursor: pointer;'

  const dropdown = document.createElement('div')
  dropdown.style.cssText = 'display: none; position: absolute; top: 100%; left: 0; margin-top: 4px; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 100; min-width: 140px;'

  for (const opt of SORT_OPTIONS) {
    const item = document.createElement('div')
    item.textContent = opt.label
    item.style.cssText = 'padding: 8px 12px; font-size: 13px; cursor: pointer; border-bottom: 1px solid #f0f0f0;'
    if (currentSort === opt.key) item.style.background = '#eff6ff'
    item.addEventListener('mouseenter', () => item.style.background = '#f5f5f5')
    item.addEventListener('mouseleave', () => item.style.background = currentSort === opt.key ? '#eff6ff' : '#fff')
    item.addEventListener('click', () => {
      currentSort = currentSort === opt.key ? null : opt.key
      dropdown.style.display = 'none'
      renderTable(el, apartmentsData)
    })
    dropdown.appendChild(item)
  }

  sortBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none'
  })

  document.addEventListener('click', () => dropdown.style.display = 'none', { once: true })

  sortWrapper.appendChild(sortBtn)
  sortWrapper.appendChild(dropdown)
  toolbar.appendChild(sortWrapper)
  el.appendChild(toolbar)

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
