export type LspServerId = 'typescript' | 'java'

export type LspStartPayload = {
  serverId: LspServerId
  rootUri: string
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
}
