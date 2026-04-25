import { create } from 'zustand'
import toast from '@/components/ui-elements/Toast'

type Webhook = {
  name: string
  url: string
}

type WebhookStore = {
  name: string
  url: string
  webhookList: Webhook[]
  loadWebhookConfig: () => Promise<void>
  addWebhook: (webhook: Webhook) => Promise<boolean>
  updateWebhook: (webhook: Webhook) => Promise<boolean>
  deleteWebhook: (name: string) => Promise<boolean>
}

export const useWebhookStore = create<WebhookStore>((set, _get) => ({
  name: '',
  url: '',
  webhookList: [],

  loadWebhookConfig: async () => {
    const data = await window.api.webhook.get()
    set({ webhookList: data.webhooks })
  },

  addWebhook: async (webhook: Webhook): Promise<boolean> => {
    const data = await window.api.webhook.get()
    const isDuplicate = data.webhooks.some(item => item.name === webhook.name)
    if (isDuplicate) {
      toast.warning('Webhook name already exists.')
      return false
    }

    data.webhooks.push(webhook)
    await window.api.webhook.set(data)
    set({ webhookList: data.webhooks })
    toast.success('Webhook added successfully.')
    return true
  },

  updateWebhook: async (webhook: Webhook): Promise<boolean> => {
    const data = await window.api.webhook.get()
    const index = data.webhooks.findIndex(item => item.name === webhook.name)
    if (index === -1) {
      toast.error('Webhook not found.')
      return false
    }

    data.webhooks[index] = webhook
    await window.api.webhook.set(data)
    set({ webhookList: data.webhooks })
    toast.success('Webhook updated successfully.')
    return true
  },

  deleteWebhook: async (name: string): Promise<boolean> => {
    const data = await window.api.webhook.get()
    const updatedWebhooks = data.webhooks.filter(webhook => webhook.name !== name)
    await window.api.webhook.set({ webhooks: updatedWebhooks })
    set({ webhookList: updatedWebhooks })
    toast.success('Webhook deleted successfully.')
    return true
  },
}))
