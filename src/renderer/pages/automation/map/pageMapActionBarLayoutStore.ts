const STORAGE_KEY = 'pageMap:actionBarVertical'

function readFromStorage(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

let vertical = readFromStorage()
const listeners = new Set<() => void>()

function emit() {
  for (const cb of listeners) cb()
}

export function getPageMapActionBarVertical(): boolean {
  return vertical
}

export function setPageMapActionBarVertical(next: boolean) {
  if (vertical === next) return
  vertical = next
  try {
    localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
  } catch {
    /* ignore */
  }
  emit()
}

export function subscribePageMapActionBarVertical(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}
