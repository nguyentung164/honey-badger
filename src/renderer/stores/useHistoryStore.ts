import { create } from 'zustand'
import logger from '@/services/logger'

type History = {
  message: string
  date: string
}

type HistoryStore = {
  message: string
  date: string
  commitMessages: History[]
  loadHistoryConfig: () => Promise<void>
  addHistory: (history: History) => Promise<boolean>
}

export const useHistoryStore = create<HistoryStore>((set, _get) => {
  logger.info('Initializing useHistoryStore...')
  return {
    message: '',
    date: '',
    commitMessages: [],
    loadHistoryConfig: async () => {
      logger.info('loadHistoryConfig is called')
      try {
        const res = await window.api.commitMessageHistory.get()
        const messages = res.status === 'success' && res.data ? res.data : []
        logger.info('Data retrieved from MySQL:', messages)
        set({ commitMessages: messages })
      } catch (error) {
        logger.error('Error when loading commit:', error)
        set({ commitMessages: [] })
      }
    },

    addHistory: async (history: History): Promise<boolean> => {
      logger.info('addHistory is called with:', history)
      try {
        const addRes = await window.api.commitMessageHistory.add(history)
        if (addRes.status !== 'success') {
          logger.error('Failed to add history:', addRes.message)
          return false
        }
        logger.info('Successfully added history')
        const res = await window.api.commitMessageHistory.get()
        const messages = res.status === 'success' && res.data ? res.data : []
        logger.info('Data retrieved from MySQL:', messages)
        set({ commitMessages: messages })
        return true
      } catch (error) {
        logger.error('Error when adding history:', error)
        return false
      }
    },
  }
})
