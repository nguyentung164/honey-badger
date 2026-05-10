/**
 * Milestone task type — single source for visuals (dialog, filters, table/Kanban badges, Gantt row).
 * Aligns with DB seed `task_types.color` for code `milestone` (#e11d48).
 */
export const TASK_TYPE_MILESTONE_HEX = '#e11d48'

/** Combobox / filter list: icon + label (no filled badge background). */
export const TASK_TYPE_MILESTONE_COMBO_TEXT_CLASS = 'text-rose-700 dark:text-rose-400'

/** Badge fallback when not using inline hex from `typeColorMap`. */
export const TASK_TYPE_MILESTONE_BADGE_CLASS = 'bg-rose-500/20 text-rose-700 dark:text-rose-400'

export const TASK_TYPE_MILESTONE_RING_CLASS = 'ring-rose-500/50'

/** Gantt scheduled milestone row — diamond icon + title link. */
export const TASK_TYPE_MILESTONE_GANTT_DIAMOND_CLASS = 'text-rose-600 dark:text-rose-400'
export const TASK_TYPE_MILESTONE_GANTT_TITLE_CLASS = 'text-rose-700 dark:text-rose-400'

/** Gantt timeline — rotated square on the date axis (not amber / bug). */
export const TASK_TYPE_MILESTONE_GANTT_TIMELINE_MARKER_SOLID = 'border-rose-500 bg-rose-400/85 dark:border-rose-400 dark:bg-rose-600/55'
export const TASK_TYPE_MILESTONE_GANTT_TIMELINE_MARKER_PARENT_RING = 'border-rose-600 dark:border-rose-400'

/** Half-and-half fill when milestone row has children (unselected). */
export const TASK_TYPE_MILESTONE_GANTT_TIMELINE_GRAD_PARENT_UNSELECTED =
  'linear-gradient(to bottom, rgba(225, 29, 72, 0.95) 0%, rgba(225, 29, 72, 0.95) 50%, rgba(251, 113, 133, 0.72) 50%, rgba(251, 113, 133, 0.72) 100%)'
