const PATCHED_ATTR = 'data-hb-lucide-icon'
const ICON_SIZE = 16

function buildChevronsUpDownHtml(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevrons-up-down" aria-hidden="true"><path d="m7 15 5 5 5-5"></path><path d="m7 9 5-5 5 5"></path></svg>`
}

function needsPatch(el: HTMLElement): boolean {
  if (el.classList.contains('codicon-unfold')) return true
  const svg = el.querySelector('svg.lucide-chevrons-up-down')
  if (!svg) return true
  return svg.getAttribute('width') !== String(ICON_SIZE)
}

function patchHiddenLinesIcon(el: HTMLElement): void {
  el.setAttribute(PATCHED_ATTR, '1')
  el.className = 'diff-hidden-lines-expand-icon'
  el.innerHTML = buildChevronsUpDownHtml(ICON_SIZE)
}

export function patchDiffHiddenLinesIcons(root: ParentNode): void {
  const icons = root.querySelectorAll<HTMLElement>(
    '.diff-hidden-lines .center a > .codicon-unfold, .diff-hidden-lines .center a > .diff-hidden-lines-expand-icon'
  )
  for (const el of icons) {
    if (!needsPatch(el)) continue
    patchHiddenLinesIcon(el)
  }
}

export function observeDiffHiddenLinesIcons(root: HTMLElement): () => void {
  let rafId = 0
  const schedulePatch = () => {
    if (rafId !== 0) return
    rafId = requestAnimationFrame(() => {
      rafId = 0
      patchDiffHiddenLinesIcons(root)
    })
  }

  schedulePatch()

  const observer = new MutationObserver(schedulePatch)
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })

  return () => {
    if (rafId !== 0) cancelAnimationFrame(rafId)
    observer.disconnect()
  }
}
