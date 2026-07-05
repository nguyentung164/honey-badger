export function makeAppWithSingleInstanceLock(fn: () => void) {
  fn()
}
