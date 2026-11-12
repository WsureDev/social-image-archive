import type { GalleryImage } from './api'

const template = document.querySelector<HTMLTemplateElement>('#image-card')!
const dateFormat = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })

export function createImageCard(row: GalleryImage, openPreview: () => void, onTag: (tag: string) => void, marked: boolean, onSelect: (selected: boolean) => void) {
  const card = template.content.firstElementChild!.cloneNode(true) as HTMLElement
  card.dataset.id = row.id
  card.classList.toggle('marked-delete', marked)
  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.className = 'select-image'
  checkbox.checked = marked
  checkbox.setAttribute('aria-label', '选择删除 ' + row.payload.author.name + ' 的图片')
  checkbox.addEventListener('click', function (event) { event.stopPropagation() })
  checkbox.addEventListener('change', function () { onSelect(checkbox.checked) })
  card.prepend(checkbox)
  const link = card.querySelector<HTMLAnchorElement>('.image-link')!
  link.href = row.image
  link.setAttribute('aria-label', '查看 ' + row.payload.author.name + ' 的图片')
  link.addEventListener('click', function (event) {
    event.preventDefault()
    openPreview()
  })
  const image = card.querySelector<HTMLImageElement>('img')!
  image.src = row.thumbnail
  image.alt = row.payload.author.name + ' · ' + row.payload.platform
  card.querySelector<HTMLElement>('.image-author')!.textContent = row.payload.author.name
  card.querySelector<HTMLElement>('.image-platform')!.textContent = row.payload.platform
  const date = card.querySelector<HTMLTimeElement>('time')!
  date.dateTime = row.payload.publishedAt
  date.textContent = dateFormat.format(new Date(row.payload.publishedAt))
  const tags = card.querySelector<HTMLElement>('.image-tags')!
  for (const tag of row.payload.tags.slice(0, 3)) {
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'tag-chip'
    chip.textContent = tag
    chip.addEventListener('click', function () { onTag(tag) })
    tags.appendChild(chip)
  }
  tags.title = row.payload.tags.join(' / ')
  card.querySelector<HTMLElement>('.image-size')!.textContent = row.width + ' × ' + row.height
  card.querySelector<HTMLAnchorElement>('.original-link')!.href = row.image
  const post = card.querySelector<HTMLAnchorElement>('.post-link')!
  if (row.payload.postUrl) {
    post.href = row.payload.postUrl
  } else {
    post.hidden = true
  }
  return card
}
