import { z } from 'zod'
import { deleteImages, fetchPage, fetchFacets, type GalleryResult } from './api'
import { createImageCard } from './cards'
import { renderPagination } from './pagination'
import { GalleryStateSchema, readLocation, randomSeed, searchParams, type GalleryState } from './query'
import { closePreview, openPreview } from './viewer'
import '@tabler/core/dist/css/tabler.min.css'
import 'photoswipe/style.css'
import './styles.css'

const form = document.querySelector<HTMLFormElement>('#filters')!
const grid = document.querySelector<HTMLElement>('#images')!
const status = document.querySelector<HTMLElement>('#status')!
const errorBox = document.querySelector<HTMLElement>('#error')!
const empty = document.querySelector<HTMLElement>('#empty')!
const jump = document.querySelector<HTMLInputElement>('#page-number')!
const pagers = [...document.querySelectorAll<HTMLElement>('.pager')]
let state = readLocation()
let total = 0
let request: AbortController | undefined
let checkedIds = new Set<string>()
let markedIds = new Set<string>()
let currentRows = new Map<string, GalleryResult['images'][number]>()

function updateDeleteButtons() {
  const button = document.querySelector<HTMLButtonElement>('#delete-marked')!
  button.disabled = markedIds.size === 0
  button.textContent = '确认删除 ' + markedIds.size + ' 张'
}

function showError(error: unknown) {
  errorBox.textContent = '暂时无法加载，请点击查询重试。'
  errorBox.hidden = false
  console.error(error)
}

function syncForm(next: GalleryState) {
  for (const key of ['q', 'author', 'tag', 'platform', 'from', 'to', 'order', 'limit'] as const) {
    const input = form.querySelector<HTMLInputElement | HTMLSelectElement>('[name="' + key + '"]')!
    input.value = String(next[key])
  }
}

function renderPagers(next: GalleryState, busy: boolean) {
  const pages = Math.max(1, Math.ceil(total / next.limit))
  for (const pager of pagers) {
    renderPagination(pager, next.page, pages, function (page) {
      void load({ ...state, page }, 'push')
    }, busy)
  }
  jump.value = String(next.page)
  jump.max = String(pages)
  jump.disabled = busy || total === 0
  document.querySelector<HTMLButtonElement>('#jump button')!.disabled = busy || total === 0
}

function render(result: GalleryResult, next: GalleryState) {
  currentRows = new Map(result.images.map(function (row) { return [row.id, row] }))
  grid.replaceChildren(...result.images.map(function (row, index) {
    return createImageCard(row, function () {
      void openPreview(next, result, index, showError).catch(showError)
    }, function (tag) {
      void load({ ...state, tag, page: 1 }, 'push')
    }, markedIds.has(row.id), function (selected) {
      if (selected) {
        checkedIds.add(row.id)
      } else {
        checkedIds.delete(row.id)
      }
    })
  }))
  empty.hidden = result.total !== 0
  const pageCount = Math.max(1, Math.ceil(result.total / next.limit))
  status.textContent = '共 ' + result.total.toLocaleString() + ' 张 · 第 ' + next.page + ' / ' + pageCount + ' 页'
  let start = 0
  if (result.images.length > 0) {
    start = result.offset + 1
  }
  document.querySelector<HTMLElement>('#range')!.textContent = '显示第 ' + start + '–' + (result.offset + result.images.length) + ' 张，共 ' + result.total + ' 张'
  let heading = '全部收藏'
  if (next.q || next.tag || next.author || next.platform || next.from || next.to) {
    heading = '筛选结果'
  }
  document.querySelector<HTMLElement>('#result-title')!.textContent = heading
  updateDeleteButtons()
}

async function load(next: GalleryState, historyMode: 'push' | 'replace' | 'none') {
  request?.abort()
  closePreview()
  const controller = new AbortController()
  request = controller
  errorBox.hidden = true
  grid.setAttribute('aria-busy', 'true')
  status.textContent = '正在加载收藏…'
  renderPagers(next, true)
  try {
    const result = await fetchPage(next, next.page, controller.signal)
    if (controller.signal.aborted) {
      return
    }
    const lastPage = Math.max(1, Math.ceil(result.total / next.limit))
    if (next.page > lastPage) {
      await load({ ...next, page: lastPage }, historyMode)
      return
    }
    state = next
    total = result.total
    syncForm(next)
    render(result, next)
    renderPagers(next, false)
    const url = '?' + searchParams(next)
    if (historyMode === 'push') {
      history.pushState(null, '', url)
    }
    if (historyMode === 'replace') {
      history.replaceState(null, '', url)
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      showError(error)
      status.textContent = '加载失败，现有收藏仍保留在下方'
      renderPagers(state, false)
    }
  } finally {
    if (!controller.signal.aborted) {
      grid.setAttribute('aria-busy', 'false')
    }
  }
}

function submitFilters() {
  const next = GalleryStateSchema.parse({
    ...state, ...Object.fromEntries(new FormData(form)), page: 1, snapshot: new Date().toISOString()
  })
  if (next.from && next.to && next.from > next.to) {
    errorBox.textContent = '开始日期不能晚于结束日期。'
    errorBox.hidden = false
    return
  }
  if (next.order === 'random' && state.order !== 'random') {
    next.seed = randomSeed()
  }
  void load(next, 'push')
}

function reset() {
  void load(GalleryStateSchema.parse({}), 'push')
}

form.addEventListener('submit', function (event) {
  event.preventDefault()
  submitFilters()
})
for (const name of ['order', 'limit']) {
  form.querySelector('[name="' + name + '"]')!.addEventListener('change', submitFilters)
}
document.querySelector('#reset')!.addEventListener('click', reset)
document.querySelector('#empty-reset')!.addEventListener('click', reset)
document.querySelector('#refresh')!.addEventListener('click', function () {
  void load({ ...state, page: 1, snapshot: new Date().toISOString() }, 'push')
})
document.querySelector('#shuffle')!.addEventListener('click', function () {
  void load({ ...state, order: 'random', seed: randomSeed(), page: 1, snapshot: new Date().toISOString() }, 'push')
})
document.querySelector('#mark-page')!.addEventListener('click', function () {
  for (const id of currentRows.keys()) {
    checkedIds.add(id)
  }
  renderPagers(state, false)
  for (const checkbox of grid.querySelectorAll<HTMLInputElement>('.select-image')) {
    checkbox.checked = true
  }
})
document.querySelector('#mark-delete')!.addEventListener('click', function () {
  for (const id of checkedIds) {
    markedIds.add(id)
  }
  checkedIds.clear()
  renderPagers(state, false)
  for (const card of grid.querySelectorAll<HTMLElement>('.archive-card')) {
    const id = card.dataset.id
    const checkbox = card.querySelector<HTMLInputElement>('.select-image')
    if (id && markedIds.has(id)) {
      card.classList.add('marked-delete')
      if (checkbox) { checkbox.checked = false }
    }
  }
  updateDeleteButtons()
})
document.querySelector('#delete-marked')!.addEventListener('click', async function () {
  if (markedIds.size === 0) { return }
  const count = markedIds.size
  if (!window.confirm('确认永久删除已标记的 ' + count + ' 张图片？原图和档案都会删除。')) { return }
  const button = document.querySelector<HTMLButtonElement>('#delete-marked')!
  button.disabled = true
  try {
    await deleteImages([...markedIds])
    markedIds.clear()
    checkedIds.clear()
    await load({ ...state, page: 1, snapshot: new Date().toISOString() }, 'replace')
  } catch (error) {
    showError(error)
    updateDeleteButtons()
  }
})
document.querySelector('#jump')!.addEventListener('submit', function (event) {
  event.preventDefault()
  const page = z.coerce.number().int().min(1).max(Math.max(1, Math.ceil(total / state.limit))).safeParse(jump.value)
  if (page.success) {
    void load({ ...state, page: page.data }, 'push')
  }
})
window.addEventListener('popstate', function () { void load(readLocation(), 'none') })

async function populateFilters() {
  const facets = await fetchFacets()
  const dateRange = document.querySelector<HTMLElement>('#date-range')!
  const from = document.querySelector<HTMLInputElement>('#from')!
  const to = document.querySelector<HTMLInputElement>('#to')!
  if (facets.dateRange.from && facets.dateRange.to) {
    const first = facets.dateRange.from.slice(0, 10)
    const last = facets.dateRange.to.slice(0, 10)
    from.min = first
    from.max = last
    to.min = first
    to.max = last
    dateRange.textContent = '有效数据范围：' + first + ' 至 ' + last + '（按原帖发布时间）'
  } else {
    dateRange.textContent = '当前没有可用日期数据'
  }
  const platforms = document.querySelector<HTMLSelectElement>('#platform')!
  for (const value of facets.platforms) {
    const option = document.createElement('option')
    option.value = value
    option.textContent = value
    platforms.appendChild(option)
  }
  for (const tag of facets.tags) {
    const option = document.createElement('option')
    option.value = tag
    document.querySelector('#tag-options')!.appendChild(option)
  }
  for (const author of facets.authors) {
    const option = document.createElement('option')
    option.value = author.id
    option.label = author.name
    document.querySelector('#author-options')!.appendChild(option)
  }
  syncForm(state)
}
syncForm(state)
void load(state, 'replace')
void populateFilters().catch(function (error) { console.error(error) })
