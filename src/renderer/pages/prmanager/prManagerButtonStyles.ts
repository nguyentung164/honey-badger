/** Chữ + icon emerald (dùng chung header và cell «Tạo PR» trên PrBoard). */
export const PR_MANAGER_ACCENT_TEXT =
  'text-emerald-600 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-400 [&_svg]:text-emerald-600 dark:[&_svg]:text-emerald-400'

/** Viền + nền trong suốt emerald (dùng chung nút outline accent PR / Task). */
export const PR_MANAGER_ACCENT_OUTLINE_SURFACE =
  'border-emerald-500/50 bg-emerald-500/22 hover:bg-emerald-500/32 dark:border-emerald-400/40 dark:bg-emerald-500/18 dark:hover:bg-emerald-500/28'

/** Nền emerald trong title bar — không viền (tránh “double border” với bar). */
export const PR_MANAGER_ACCENT_TITLEBAR_SURFACE =
  'border-0 shadow-none bg-emerald-500/22 hover:bg-emerald-500/32 dark:bg-emerald-500/18 dark:hover:bg-emerald-500/28'

/** Cùng style với nút «Tạo PR» trên PrBoard (outline + emerald). */
export const PR_MANAGER_ACCENT_OUTLINE_BTN = `h-8 gap-1 ${PR_MANAGER_ACCENT_TEXT}`

/** Bản compact (title bar / toolbar cao ~32px). */
export const PR_MANAGER_ACCENT_OUTLINE_BTN_COMPACT = `h-6 gap-1 shrink-0 px-2 text-xs ${PR_MANAGER_ACCENT_TEXT}`
