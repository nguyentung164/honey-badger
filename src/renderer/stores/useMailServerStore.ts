import { create } from 'zustand'

type MailServerStore = {
  smtpServer: string
  port: string
  email: string
  password: string
  setFieldMailServer: (key: keyof Omit<MailServerStore, 'setFieldMailServer' | 'saveMailServerConfig' | 'loadMailServerConfig'>, value: string) => void
  saveMailServerConfig: () => Promise<void>
  loadMailServerConfig: () => Promise<void>
}

export const useMailServerStore = create<MailServerStore>((set, get) => ({
  smtpServer: '',
  port: '',
  email: '',
  password: '',
  setFieldMailServer: (key, value) => set({ [key]: value }),
  saveMailServerConfig: async () => {
    const { setFieldMailServer, saveMailServerConfig, loadMailServerConfig, ...config } = get()
    await window.api.mail_server.set(config)
  },
  loadMailServerConfig: async () => {
    const data = (await window.api.mail_server.get()) as Record<string, unknown>
    const keys = ['smtpServer', 'port', 'email', 'password'] as const
    const toStr = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))
    const patch = Object.fromEntries(keys.map(k => [k, toStr(data[k])])) as Pick<MailServerStore, 'smtpServer' | 'port' | 'email' | 'password'>
    set(patch)
  },
}))
