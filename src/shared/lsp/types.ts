export type LspServerId = 'typescript' | 'java'

export type TypeScriptUserPreferencesConfig = {
  preferGoToSourceDefinition: boolean
}

export type LspServerCapabilities = {
  customSourceDefinitionProvider?: boolean
}

export type LspStartPayload = {
  serverId: LspServerId
  rootUri: string
  typescriptUserPreferences?: TypeScriptUserPreferencesConfig
}

export type LspStartResult = {
  success: boolean
  error?: string
  capabilities?: LspServerCapabilities
}

export type LspStopPayload = {
  serverId: LspServerId
  rootUri: string
}

export type LspSendPayload = {
  serverId: LspServerId
  rootUri: string
  message: string
}

export type LspMessageEvent = {
  serverId: LspServerId
  rootUri: string
  message: string
}

export type LspServerState = 'starting' | 'ready' | 'error' | 'stopped'

export type LspStateEvent = {
  serverId: LspServerId
  rootUri: string
  state: LspServerState
  error?: string
  capabilities?: LspServerCapabilities
}
