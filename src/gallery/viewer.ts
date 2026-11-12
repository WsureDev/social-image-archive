import type PhotoSwipe from 'photoswipe'
import { fetchPage, type GalleryResult } from './api'
import type { GalleryState } from './query'

let active: PhotoSwipe | undefined
let generation = 0

export function closePreview() {
  generation += 1
  active?.close()
  active = undefined
}

export async function openPreview(state: GalleryState, initial: GalleryResult, localIndex: number, onError: (error: unknown) => void) {
  closePreview()
  const version = generation
  const { default: PhotoSwipe } = await import('photoswipe')
  if (version !== generation) {
    return
  }
  const pages = new Map<number, GalleryResult>([[state.page, initial]])
  const pending = new Map<number, Promise<GalleryResult>>()
  const controller = new AbortController()
  const totalPages = Math.ceil(initial.total / state.limit)
  let closed = false

  async function ensure(page: number) {
    const cached = pages.get(page)
    if (cached) {
      return cached
    }
    const existing = pending.get(page)
    if (existing) {
      return existing
    }
    const operation = fetchPage(state, page, controller.signal)
    pending.set(page, operation)
    try {
      const result = await operation
      pages.set(page, result)
      return result
    } finally {
      pending.delete(page)
    }
  }

  function report(error: unknown) {
    if (!closed) {
      onError(error)
    }
  }

  const viewer = new PhotoSwipe({
    dataSource: [],
    index: initial.offset + localIndex,
    showHideAnimationType: 'none',
    showAnimationDuration: 0,
    hideAnimationDuration: 0,
    zoomAnimationDuration: 0,
    initialZoomLevel: 'fit',
    secondaryZoomLevel: 'fit',
    zoom: false,
    loop: false,
    preload: [1, 1],
    bgOpacity: 1,
    closeTitle: '关闭（Esc）',
    arrowPrevTitle: '上一张',
    arrowNextTitle: '下一张',
    errorMsg: '图片加载失败，可切换到相邻图片后重试'
  })
  active = viewer
  viewer.addFilter('numItems', function () { return initial.total })
  viewer.addFilter('itemData', function (_data, index) {
    const page = Math.floor(index / state.limit) + 1
    const row = pages.get(page)?.images[index % state.limit]
    if (!row) {
      void ensure(page).then(function () {
        if (!closed) {
          viewer.refreshSlideContent(index)
        }
      }).catch(report)
      return { html: '<div class="viewer-loading">正在加载…</div>', width: 800, height: 600 }
    }
    return { src: row.image, width: row.width, height: row.height, alt: row.payload.author.name }
  })
  viewer.on('change', function () {
    const page = Math.floor(viewer.currIndex / state.limit) + 1
    for (const adjacent of [page - 1, page, page + 1]) {
      if (adjacent >= 1 && adjacent <= totalPages) {
        void ensure(adjacent).catch(report)
      }
    }
  })
  viewer.on('destroy', function () {
    closed = true
    controller.abort()
    pages.clear()
    if (active === viewer) {
      active = undefined
    }
  })
  viewer.init()
}
