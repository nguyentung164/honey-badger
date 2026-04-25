/**
 * Phase mặc định khớp EVM_Tool.txt (mục 6). Một nguồn cho main + renderer + seed.
 */
export const EVM_DEFAULT_PHASES = [
  { code: 'sd', name: 'System Design' },
  { code: 'bd', name: 'Basic Design' },
  { code: 'dd', name: 'Detail Design' },
  { code: 'cd_ut', name: 'Coding' },
  { code: 'it', name: 'Integration Test' },
  { code: 'uat', name: 'User Acceptance Test' },
] as const

export type EvmDefaultPhase = (typeof EVM_DEFAULT_PHASES)[number]
