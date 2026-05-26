'use client'

import { createContext } from 'react'
import type { PageMapActionsValue } from '@/pages/automation/map/pageMapGraph'

export const PageMapActionsContext = createContext<PageMapActionsValue | null>(null)
