import Store from 'electron-store'

type Schema = {
  externalEditors: { name: string; path: string }[]
}

const DEFAULT_EDITORS: { name: string; path: string }[] = [
  { name: 'VS Code', path: 'code' },
  { name: 'Notepad++', path: 'notepad++' },
  { name: 'Notepad', path: 'notepad' },
]

const store = new Store<Schema>({
  name: 'external-editors',
  defaults: {
    externalEditors: DEFAULT_EDITORS,
  },
})

export default store
