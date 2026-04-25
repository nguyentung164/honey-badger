import { Client } from '@microsoft/microsoft-graph-client'
import axios from 'axios'
import l from 'electron-log'
import configurationStore from '../store/ConfigurationStore'

const scopes = 'Files.ReadWrite.All Files.ReadWrite Sites.ReadWrite.All'
const getAccessToken = async (): Promise<string> => {
  try {
    const { oneDriveClientId, oneDriveClientSecret, oneDriveRefreshToken } = configurationStore.store
    const tokenEndpoint = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
    const formData = new URLSearchParams()
    formData.append('client_id', oneDriveClientId)
    formData.append('client_secret', oneDriveClientSecret)
    formData.append('refresh_token', oneDriveRefreshToken)
    formData.append('grant_type', 'refresh_token')
    formData.append('scope', scopes)
    const response = await axios.post(tokenEndpoint, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    if (!response.data.access_token) {
      throw new Error('Không lấy được access token')
    }
    if (response.data.refresh_token) {
      await configurationStore.set({
        ...configurationStore.store,
        oneDriveRefreshToken: response.data.refresh_token,
      })
      l.info('✅ Đã cập nhật refresh token mới')
    }
    return response.data.access_token
  } catch (error: any) {
    l.error(error.message)
    if (error.response?.data?.error === 'invalid_grant') {
      throw new Error(error)
    }
    if (error.response?.data?.error === 'invalid_client') {
      throw new Error(error)
    }
    throw new Error(error)
  }
}

export const getGraphClient = async (): Promise<Client> => {
  try {
    const token = await getAccessToken()
    const client = Client.init({
      authProvider: done => {
        done(null, token)
      },
      debugLogging: true,
    })
    return client
  } catch (error: any) {
    l.error(error)
    if (error.statusCode === 401 || error.body?.includes('401')) {
      l.error(error)
      throw new Error(error)
    }
    throw error
  }
}
