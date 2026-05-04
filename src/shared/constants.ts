export const ENVIRONMENT = {
  IS_DEV: process.env.NODE_ENV === 'development',
}

export const PLATFORM = {
  IS_MAC: process.platform === 'darwin',
  IS_WINDOWS: process.platform === 'win32',
  IS_LINUX: process.platform === 'linux',
}

/**
 * Giới hạn batch API board (Kanban/Gantt/Calendar). Luôn khớp LIMIT trong truy vấn Postgres `listTasksForManagementBoard`.
 */
export const MANAGEMENT_BOARD_MAX_ROWS = 5000

/** Main process → renderer (cửa sổ chính): trạng thái PR Manager tách/gộp. */
export const PR_MANAGER_RENDERER_CHANNELS = {
  DOCKED_TO_MAIN: 'pr-manager:docked-to-main',
  WINDOW_CLOSED: 'pr-manager:window-closed',
} as const
