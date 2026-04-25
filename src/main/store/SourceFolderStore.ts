import Store from 'electron-store'

type Schema = {
  sourceFolders: { name: string; path: string }[]
}

const store = new Store<Schema>({
  name: 'source-folders',
  defaults: {
    sourceFolders: [],
  },
})

export default store
