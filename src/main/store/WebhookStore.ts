import Store from 'electron-store'

type Schema = {
  webhooks: { name: string; url: string }[]
}

const store = new Store<Schema>({
  name: 'webhook-ms-teams',
  defaults: {
    webhooks: [],
  },
})
export default store
