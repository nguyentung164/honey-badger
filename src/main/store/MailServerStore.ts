import Store from 'electron-store'

type Schema = {
  smtpServer: string
  port: string
  email: string
  password: string
}

const store = new Store<Schema>({
  name: 'mail-server',
  defaults: {
    smtpServer: '',
    port: '',
    email: '',
    password: '',
  },
})
export default store
