import Store from 'electron-store'

type Schema = {
  codingRules: { name: string; content: string }[]
}

const store = new Store<Schema>({
  name: 'coding-rules',
  defaults: {
    codingRules: [],
  },
})
export default store
