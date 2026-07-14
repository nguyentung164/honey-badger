export type BranchMode = 'checkout' | 'logRef'

export function getBranchMode(shellView: string): BranchMode {
  return shellView === 'showLog' ? 'logRef' : 'checkout'
}
