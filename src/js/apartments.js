import { normalizeLayerName } from './utils.js';

let hideSold = false
let apartmentsData = []
let onFilterChangeCallback = null
let currentSort = null
let expandedRangeField = null
let filterDebounceTimer = null

function debounceFilter(callback, delay = 150) {
  clearTimeout(filterDebounceTimer)
  filterDebounceTimer = setTimeout(callback, delay)
}

function calculateStep(min, max, decimals) {
  const range = max - min
  if (range === 0) return 1
  const step = range / 100
  if (decimals > 0) return Math.max(Math.pow(10, -decimals), step)
  return Math.max(1, Math.round(step))
}

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

const RANGE_FIELDS = [
  { key: 'price', label: 'Price', unit: 'zł', decimals: 0 },
  { key: 'price_per_square_metre', label: 'Price/m²', unit: 'zł/m²', decimals: 0 },
  { key: 'area', label: 'Area', unit: 'm²', decimals: 2 },
  { key: 'floor', label: 'Floor', unit: '', decimals: 0 }
]

const rangeFilters = {}

function getFieldBounds(field) {
  const values = apartmentsData.map(a => a[field]).filter(v => v != null && !isNaN(v))
  if (values.length === 0) return { min: 0, max: 100 }
  return { min: Math.min(...values), max: Math.max(...values) }
}

function formatValue(value, decimals, unit) {
  const formatted = decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString()
  return unit ? `${formatted} ${unit}` : formatted
}

function isRangeActive(field) {
  const filter = rangeFilters[field]
  if (!filter) return false
  const bounds = getFieldBounds(field)
  return filter.min > bounds.min || filter.max < bounds.max
}

export function setOnFilterChange(callback) {
  onFilterChangeCallback = callback
}

export function getHiddenLayers() {
  const visibleApartments = getFilteredApartments()
  const visibleLayers = new Set(visibleApartments.map(a => normalizeLayerName(a.layer_name)).filter(Boolean))
  
  return apartmentsData
    .map(a => normalizeLayerName(a.layer_name))
    .filter(layer => layer && !visibleLayers.has(layer))
}

function getFilteredApartments() {
  let filtered = apartmentsData
  if (hideSold) {
    filtered = filtered.filter(a => a.state?.toLowerCase() !== 'sold')
  }
  filtered = applyRangeFilters(filtered)
  return filtered
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

function applyRangeFilters(apartments) {
  return apartments.filter(a => {
    for (const field of RANGE_FIELDS) {
      const filter = rangeFilters[field.key]
      if (!filter) continue
      const val = a[field.key]
      if (val == null) continue
      if (val < filter.min || val > filter.max) return false
    }
    return true
  })
}

function createRangeEditor(field, onUpdate) {
  const bounds = getFieldBounds(field.key)
  if (!rangeFilters[field.key]) {
    rangeFilters[field.key] = { min: bounds.min, max: bounds.max }
  }
  const filter = rangeFilters[field.key]
  const isActive = isRangeActive(field.key)
  const isExpanded = expandedRangeField === field.key

  const container = document.createElement('div')
  container.style.cssText = 'margin-bottom: 4px;'

  const row = document.createElement('div')
  row.style.cssText = `display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: ${isActive ? '#eff6ff' : '#fff'}; border: 1px solid ${isActive ? '#3b82f6' : '#e5e7eb'}; border-radius: 6px; cursor: pointer; transition: all 150ms ease;`
  row.addEventListener('mouseenter', () => { if (!isExpanded) row.style.background = isActive ? '#dbeafe' : '#f9fafb' })
  row.addEventListener('mouseleave', () => { if (!isExpanded) row.style.background = isActive ? '#eff6ff' : '#fff' })

  const label = document.createElement('span')
  label.style.cssText = 'font-size: 13px; font-weight: 500; color: #374151;'
  label.textContent = field.label

  const rightSide = document.createElement('div')
  rightSide.style.cssText = 'display: flex; align-items: center; gap: 8px;'

  const rangeText = document.createElement('span')
  rangeText.className = 'range-text'
  rangeText.style.cssText = 'font-size: 12px; color: #6b7280; font-family: monospace;'
  rangeText.textContent = `${formatValue(filter.min, field.decimals, '')} – ${formatValue(filter.max, field.decimals, field.unit)}`

  const resetBtn = document.createElement('button')
  resetBtn.innerHTML = '×'
  resetBtn.style.cssText = `display: ${isActive ? 'flex' : 'none'}; align-items: center; justify-content: center; width: 18px; height: 18px; padding: 0; font-size: 14px; line-height: 1; background: #ef4444; color: #fff; border: none; border-radius: 50%; cursor: pointer; transition: background 150ms ease;`
  resetBtn.title = 'Reset filter'
  resetBtn.addEventListener('mouseenter', () => resetBtn.style.background = '#dc2626')
  resetBtn.addEventListener('mouseleave', () => resetBtn.style.background = '#ef4444')
  resetBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    filter.min = bounds.min
    filter.max = bounds.max
    onUpdate()
    if (onFilterChangeCallback) onFilterChangeCallback()
  })

  const chevron = document.createElement('span')
  chevron.style.cssText = 'font-size: 10px; color: #9ca3af; transition: transform 150ms ease;'
  chevron.textContent = isExpanded ? '▾' : '▸'

  rightSide.appendChild(rangeText)
  rightSide.appendChild(resetBtn)
  rightSide.appendChild(chevron)
  row.appendChild(label)
  row.appendChild(rightSide)

  const editor = document.createElement('div')
  editor.style.cssText = `overflow: hidden; max-height: ${isExpanded ? '80px' : '0'}; opacity: ${isExpanded ? '1' : '0'}; transition: max-height 200ms ease, opacity 150ms ease; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 6px 6px; margin-top: -1px;`

  const sliderContainer = document.createElement('div')
  sliderContainer.style.cssText = 'padding: 12px 16px;'

  const sliderWrapper = document.createElement('div')
  sliderWrapper.style.cssText = 'position: relative; height: 20px;'

  const sliderTrack = document.createElement('div')
  sliderTrack.style.cssText = 'position: absolute; top: 50%; left: 0; right: 0; height: 4px; background: #e5e7eb; border-radius: 2px; transform: translateY(-50%);'

  const sliderFill = document.createElement('div')
  sliderFill.className = 'slider-fill'
  const fillLeft = ((filter.min - bounds.min) / (bounds.max - bounds.min)) * 100
  const fillRight = ((filter.max - bounds.min) / (bounds.max - bounds.min)) * 100
  sliderFill.style.cssText = `position: absolute; top: 50%; height: 4px; background: #3b82f6; border-radius: 2px; transform: translateY(-50%); left: ${fillLeft}%; right: ${100 - fillRight}%;`

  const inputStyle = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; -webkit-appearance: none; appearance: none; background: transparent; pointer-events: none; outline: none;'
  const thumbStyle = `
    input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; background: #fff; border: 2px solid #3b82f6; border-radius: 50%; cursor: pointer; pointer-events: auto; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    input[type="range"]::-moz-range-thumb { width: 16px; height: 16px; background: #fff; border: 2px solid #3b82f6; border-radius: 50%; cursor: pointer; pointer-events: auto; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  `

  if (!document.getElementById('range-slider-styles')) {
    const styleEl = document.createElement('style')
    styleEl.id = 'range-slider-styles'
    styleEl.textContent = thumbStyle
    document.head.appendChild(styleEl)
  }

  const minInput = document.createElement('input')
  minInput.type = 'range'
  minInput.min = bounds.min
  minInput.max = bounds.max
  const step = calculateStep(bounds.min, bounds.max, field.decimals)
  minInput.step = step
  minInput.value = filter.min
  minInput.style.cssText = inputStyle + 'z-index: 2;'

  const maxInput = document.createElement('input')
  maxInput.type = 'range'
  maxInput.min = bounds.min
  maxInput.max = bounds.max
  maxInput.step = step
  maxInput.value = filter.max
  maxInput.style.cssText = inputStyle + 'z-index: 3;'

  const updateSlider = () => {
    const minVal = parseFloat(minInput.value)
    const maxVal = parseFloat(maxInput.value)
    filter.min = Math.min(minVal, maxVal)
    filter.max = Math.max(minVal, maxVal)
    minInput.value = filter.min
    maxInput.value = filter.max
    const newFillLeft = ((filter.min - bounds.min) / (bounds.max - bounds.min)) * 100
    const newFillRight = ((filter.max - bounds.min) / (bounds.max - bounds.min)) * 100
    sliderFill.style.left = `${newFillLeft}%`
    sliderFill.style.right = `${100 - newFillRight}%`
    rangeText.textContent = `${formatValue(filter.min, field.decimals, '')} – ${formatValue(filter.max, field.decimals, field.unit)}`
    row.style.background = isRangeActive(field.key) ? '#eff6ff' : '#fff'
    row.style.borderColor = isRangeActive(field.key) ? '#3b82f6' : '#e5e7eb'
  }

  minInput.addEventListener('input', () => { updateSlider(); debounceFilter(() => onUpdate()) })
  maxInput.addEventListener('input', () => { updateSlider(); debounceFilter(() => onUpdate()) })

  sliderWrapper.appendChild(sliderTrack)
  sliderWrapper.appendChild(sliderFill)
  sliderWrapper.appendChild(minInput)
  sliderWrapper.appendChild(maxInput)
  sliderContainer.appendChild(sliderWrapper)

  const valuesRow = document.createElement('div')
  valuesRow.style.cssText = 'display: flex; justify-content: space-between; font-size: 11px; color: #9ca3af; margin-top: 6px;'
  valuesRow.innerHTML = `<span>${formatValue(bounds.min, field.decimals, '')}</span><span>${formatValue(bounds.max, field.decimals, field.unit)}</span>`
  sliderContainer.appendChild(valuesRow)

  editor.appendChild(sliderContainer)

  row.addEventListener('click', (e) => {
    e.stopPropagation()
    expandedRangeField = isExpanded ? null : field.key
    onUpdate(true)
  })

  container.appendChild(row)
  container.appendChild(editor)
  return container
}

function renderTable(el, apartments) {
  let filtered = hideSold 
    ? apartments.filter(a => a.state?.toLowerCase() !== 'sold')
    : apartments
  filtered = applyRangeFilters(filtered)
  filtered = sortApartments(filtered)

  el.innerHTML = ''

  const filtersSection = document.createElement('section')
  filtersSection.style.cssText = 'margin-bottom: 12px;'

  for (const field of RANGE_FIELDS) {
    const editor = createRangeEditor(field, (isToggle) => {
      if (isToggle) {
        renderTable(el, apartmentsData)
      } else {
        renderTable(el, apartmentsData)
        if (onFilterChangeCallback) onFilterChangeCallback()
      }
    })
    filtersSection.appendChild(editor)
  }
  el.appendChild(filtersSection)

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
