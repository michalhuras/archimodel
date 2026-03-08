import { normalizeLayerName, highlightApartmentsByLayer } from './utils.js';
import { t } from './i18n.js';

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
  { key: 'price_asc', labelKey: 'sort.priceAsc', field: 'price', dir: 1 },
  { key: 'price_desc', labelKey: 'sort.priceDesc', field: 'price', dir: -1 },
  { key: 'price_m2_asc', labelKey: 'sort.pricePerM2Asc', field: 'price_per_square_metre', dir: 1 },
  { key: 'price_m2_desc', labelKey: 'sort.pricePerM2Desc', field: 'price_per_square_metre', dir: -1 },
  { key: 'area_asc', labelKey: 'sort.areaAsc', field: 'area', dir: 1 },
  { key: 'area_desc', labelKey: 'sort.areaDesc', field: 'area', dir: -1 },
  { key: 'floor_asc', labelKey: 'sort.floorAsc', field: 'floor', dir: 1 },
  { key: 'floor_desc', labelKey: 'sort.floorDesc', field: 'floor', dir: -1 },
  { key: 'name_asc', labelKey: 'sort.nameAsc', field: 'name', dir: 1 },
  { key: 'name_desc', labelKey: 'sort.nameDesc', field: 'name', dir: -1 }
]

const RANGE_FIELDS = [
  { key: 'price', labelKey: 'range.price', unit: 'zł', decimals: 0 },
  { key: 'price_per_square_metre', labelKey: 'range.pricePerM2', unit: 'zł/m²', decimals: 0 },
  { key: 'area', labelKey: 'range.area', unit: 'm²', decimals: 2 },
  { key: 'floor', labelKey: 'range.floor', unit: '', decimals: 0 }
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

export function openApartmentDetailsByLayer(layerName) {
  const key = normalizeLayerName(layerName)
  if (!key) return
  const apartment = apartmentsData.find(a => normalizeLayerName(a.layer_name) === key)
  if (!apartment) return
  openApartmentModal(apartment)
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
  container.className = 'range-filter-container'

  const row = document.createElement('div')
  row.className = `range-filter-row${isActive ? ' active' : ''}${isExpanded ? ' expanded' : ''}`
  row.addEventListener('mouseenter', () => { if (!isExpanded) row.classList.add('hover') })
  row.addEventListener('mouseleave', () => { if (!isExpanded) row.classList.remove('hover') })

  const label = document.createElement('span')
  label.className = 'range-filter-label'
  label.textContent = t(field.labelKey)

  const rightSide = document.createElement('div')
  rightSide.className = 'range-filter-right-side'

  const rangeText = document.createElement('span')
  rangeText.className = 'range-text'
  rangeText.textContent = `${formatValue(filter.min, field.decimals, '')} – ${formatValue(filter.max, field.decimals, field.unit)}`

  const resetBtn = document.createElement('button')
  resetBtn.innerHTML = '×'
  resetBtn.className = `range-filter-reset-btn${isActive ? ' active' : ''}`
  resetBtn.title = t('filters.reset')
  resetBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    filter.min = bounds.min
    filter.max = bounds.max
    expandedRangeField = null
    onUpdate()
    if (onFilterChangeCallback) onFilterChangeCallback()
  })

  const chevron = document.createElement('span')
  chevron.className = `range-filter-chevron${isExpanded ? ' expanded' : ''}`
  chevron.textContent = isExpanded ? '▾' : '▸'

  rightSide.appendChild(rangeText)
  rightSide.appendChild(resetBtn)
  rightSide.appendChild(chevron)
  row.appendChild(label)
  row.appendChild(rightSide)

  const editor = document.createElement('div')
  editor.className = `range-filter-editor${isExpanded ? ' expanded' : ''}`

  const sliderContainer = document.createElement('div')
  sliderContainer.className = 'range-slider-container'

  const sliderWrapper = document.createElement('div')
  sliderWrapper.className = 'range-slider-wrapper'

  const sliderTrack = document.createElement('div')
  sliderTrack.className = 'range-slider-track'

  const sliderFill = document.createElement('div')
  sliderFill.className = 'slider-fill range-slider-fill'
  const fillLeft = ((filter.min - bounds.min) / (bounds.max - bounds.min)) * 100
  const fillRight = ((filter.max - bounds.min) / (bounds.max - bounds.min)) * 100
  sliderFill.style.left = `${fillLeft}%`
  sliderFill.style.right = `${100 - fillRight}%`

  const inputStyle = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; -webkit-appearance: none; appearance: none; background: transparent; pointer-events: none; outline: none;'

  const minInput = document.createElement('input')
  minInput.type = 'range'
  minInput.min = bounds.min
  minInput.max = bounds.max
  const step = calculateStep(bounds.min, bounds.max, field.decimals)
  minInput.step = step
  minInput.value = filter.min
  minInput.className = 'range-slider-input'
  minInput.style.zIndex = '2'

  const maxInput = document.createElement('input')
  maxInput.type = 'range'
  maxInput.min = bounds.min
  maxInput.max = bounds.max
  maxInput.step = step
  maxInput.value = filter.max
  maxInput.className = 'range-slider-input'
  maxInput.style.zIndex = '3'

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
    row.classList.toggle('active', isRangeActive(field.key))
  }

  minInput.addEventListener('input', () => { updateSlider(); debounceFilter(() => onUpdate()) })
  maxInput.addEventListener('input', () => { updateSlider(); debounceFilter(() => onUpdate()) })

  sliderWrapper.appendChild(sliderTrack)
  sliderWrapper.appendChild(sliderFill)
  sliderWrapper.appendChild(minInput)
  sliderWrapper.appendChild(maxInput)
  sliderContainer.appendChild(sliderWrapper)

  const valuesRow = document.createElement('div')
  valuesRow.className = 'range-values-row'
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
  filtersSection.className = 'apartments-filters-section'

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
  toolbar.className = 'apartments-toolbar'

  const toggleBtn = document.createElement('button')
  toggleBtn.textContent = hideSold ? t('filters.showSold') : t('filters.hideSold')
  toggleBtn.className = 'apartments-toggle-btn'
  toggleBtn.addEventListener('click', () => {
    hideSold = !hideSold
    renderTable(el, apartmentsData)
    if (onFilterChangeCallback) onFilterChangeCallback()
  })
  toolbar.appendChild(toggleBtn)

  const sortWrapper = document.createElement('div')
  sortWrapper.className = 'apartments-sort-wrapper'

  const sortBtn = document.createElement('button')
  {
    const currentOpt = currentSort ? SORT_OPTIONS.find(o => o.key === currentSort) : null
    sortBtn.textContent = currentOpt ? t(currentOpt.labelKey) : t('filters.sort')
  }
  sortBtn.className = 'apartments-sort-btn'

  const dropdown = document.createElement('div')
  dropdown.className = 'apartments-sort-dropdown'

  const noneItem = document.createElement('div')
  noneItem.textContent = t('filters.sortNone')
  noneItem.className = 'apartments-sort-item'
  if (!currentSort) noneItem.classList.add('active')
  noneItem.addEventListener('mouseenter', () => noneItem.style.background = '#f5f5f5')
  noneItem.addEventListener('mouseleave', () => noneItem.style.background = currentSort ? '#fff' : '#eff6ff')
  noneItem.addEventListener('click', () => {
    currentSort = null
    dropdown.style.display = 'none'
    renderTable(el, apartmentsData)
  })
  dropdown.appendChild(noneItem)

  for (const opt of SORT_OPTIONS) {
    const item = document.createElement('div')
    item.textContent = t(opt.labelKey)
    item.className = 'apartments-sort-item'
    if (currentSort === opt.key) item.classList.add('active')
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
    dropdown.classList.toggle('show', dropdown.style.display !== 'none')
  })

  document.addEventListener('click', (e) => {
    if (dropdown.classList.contains('show') && !sortWrapper.contains(e.target)) {
      dropdown.classList.remove('show')
    }
  })

  sortWrapper.appendChild(sortBtn)
  sortWrapper.appendChild(dropdown)
  toolbar.appendChild(sortWrapper)
  el.appendChild(toolbar)

  const table = document.createElement('table')
  table.className = 'apartments-table'

  const header = document.createElement('tr')
  header.innerHTML = `<th>${t('table.name')}</th><th>${t('table.price')}</th><th>${t('table.pricePerM2')}</th><th>${t('table.area')}</th><th>${t('table.floor')}</th><th>${t('table.state')}</th>`
  header.querySelectorAll('th').forEach(th => {
    th.className = 'apartments-table-header'
  })
  table.appendChild(header)

  for (const a of filtered) {
    const row = document.createElement('tr')
    const layer = normalizeLayerName(a.layer_name)
    if (layer) row.dataset.layer = layer

    const stateKey = a.state ? `state.${a.state.toLowerCase()}` : ''
    row.innerHTML = `<td>${a.name ?? ''}</td><td>${a.price ?? ''}</td><td>${a.price_per_square_metre ?? ''}</td><td>${a.area ?? ''}</td><td>${a.floor ?? ''}</td><td>${stateKey ? t(stateKey) : ''}</td>`
    row.querySelectorAll('td').forEach(td => {
      td.className = 'apartments-table-cell'
    })
    row.className = 'apartments-table-row'
    row.addEventListener('mouseenter', () => {
      if (!layer) return
      highlightApartmentsByLayer(layer)
      window.dispatchEvent(new CustomEvent('apartment-row-hover', { detail: { layerName: layer } }))
    })
    row.addEventListener('mouseleave', () => {
      highlightApartmentsByLayer('')
      window.dispatchEvent(new CustomEvent('apartment-row-hover-end'))
    })
    row.addEventListener('click', () => openApartmentModal(a))
    table.appendChild(row)
  }

  el.appendChild(table)
}

function openApartmentModal(apartment) {
  const modal = document.createElement('div')
  modal.className = 'apartment-modal'

  const dialog = document.createElement('div')
  dialog.className = 'apartment-modal-dialog modal-dialog'

  const closeBtn = document.createElement('button')
  closeBtn.innerHTML = '×'
  closeBtn.className = 'apartment-modal-close modal-close-btn'

  const content = document.createElement('div')
  content.className = 'apartment-modal-content modal-content'

  const header = document.createElement('div')
  header.innerHTML = `<h2 class="apartment-modal-title modal-title">${apartment.name || t('modal.titleFallback')}</h2>`

  const imageSection = document.createElement('div')
  imageSection.className = 'apartment-modal-image-section modal-image-section'
  imageSection.className = 'apartment-modal-image-section'
  imageSection.innerHTML = `
    <div class="apartment-modal-image-placeholder">
      <div class="apartment-modal-image-icon">📷</div>
      <div>${t('modal.imageTitle')}</div>
      <div class="apartment-modal-image-text">${t('modal.imagePlaceholder', { name: apartment.name || '' })}</div>
    </div>
  `

  const detailsSection = document.createElement('div')
  detailsSection.className = 'apartment-modal-details-section'

  const details = [
    { label: t('table.name'), value: apartment.name || '-' },
    { label: t('table.price'), value: apartment.price ? `${apartment.price.toLocaleString()} zł` : '-' },
    { label: t('table.pricePerM2'), value: apartment.price_per_square_metre ? `${apartment.price_per_square_metre.toLocaleString()} zł/m²` : '-' },
    { label: t('table.area'), value: apartment.area ? `${apartment.area} m²` : '-' },
    { label: t('table.floor'), value: apartment.floor || '-' },
    { label: t('table.state'), value: apartment.state ? t(`state.${apartment.state.toLowerCase()}`) : '-' }
  ]

  details.forEach(detail => {
    const item = document.createElement('div')
    item.className = 'apartment-modal-detail-item'
    item.innerHTML = `
      <div class="apartment-modal-detail-label">${detail.label}</div>
      <div class="apartment-modal-detail-value">${detail.value}</div>
    `
    detailsSection.appendChild(item)
  })

  content.appendChild(header)
  content.appendChild(imageSection)
  content.appendChild(detailsSection)

  dialog.appendChild(closeBtn)
  dialog.appendChild(content)
  modal.appendChild(dialog)

  const closeModal = () => {
    document.body.style.overflow = ''
    document.body.removeChild(modal)
    highlightApartmentsByLayer('')
    window.dispatchEvent(new CustomEvent('apartment-modal-closed'))
  }

  closeBtn.addEventListener('click', closeModal)
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal()
  })
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal()
  })

  document.body.style.overflow = 'hidden'
  document.body.appendChild(modal)
  modal.focus()
}

export async function loadApartments() {
  const el = document.getElementById('apartments')

  try {
    const res = await fetch('/.netlify/functions/apartment')
    if (!res.ok) throw new Error(t('errors.requestFailed'))
    const apartments = await res.json()

    if (!Array.isArray(apartments) || apartments.length === 0) {
      el.textContent = t('apartments.none')
      return
    }

    apartmentsData = apartments
    renderTable(el, apartments)
  } catch (e) {
    el.textContent = t('errors.requestFailed')
  }
}
