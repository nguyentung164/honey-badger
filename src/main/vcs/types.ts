export interface SvnUser {
  realm: string
  username: string
}

export interface GitConfigUser {
  userName: string
  userEmail: string
  scope: 'global' | 'local'
}

export interface GitStoredCredential {
  host: string
  username: string
  source: 'store' | 'wincred'
  targetName?: string
}
