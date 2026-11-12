export function renderPagination(host: HTMLElement, page: number, totalPages: number, onPage: (page: number) => void, busy = false) {
  const list = document.createElement('ul')
  list.className = 'pagination'

  function button(label: string, target: number, disabled: boolean, current = false) {
    const item = document.createElement('li')
    item.className = 'page-item'
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'page-link'
    button.textContent = label
    button.disabled = disabled || busy
    button.dataset.page = String(target)
    if (current) {
      item.classList.add('active')
      button.setAttribute('aria-current', 'page')
    }
    button.addEventListener('click', function () { onPage(target) })
    item.appendChild(button)
    list.appendChild(item)
  }

  button('上一页', page - 1, page <= 1)
  const pages = new Set([1, totalPages, page - 1, page, page + 1])
  let previous = 0
  for (const number of [...pages].filter(function (value) { return value >= 1 && value <= totalPages }).sort(function (a, b) { return a - b })) {
    if (previous > 0 && number - previous > 1) {
      const gap = document.createElement('li')
      gap.className = 'page-item'
      const label = document.createElement('span')
      label.className = 'page-link page-gap'
      label.textContent = '…'
      gap.appendChild(label)
      list.appendChild(gap)
    }
    button(String(number), number, number === page, number === page)
    previous = number
  }
  button('下一页', page + 1, page >= totalPages)
  host.replaceChildren(list)
}
