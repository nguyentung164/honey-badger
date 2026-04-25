/**
 * Pha «PR trong app» (GitHub): tham chiếu phạm vi & hướng pha 2.
 * Không thay thế tài liệu ngoài repo; dùng cho dev/QA khi rà soát.
 * UI: components/PrDetailDialog.tsx — tính năng ngoài pha (editor conflict, checks đầy đủ) không nằm file này.
 */

/** C\u00e1c b\u01b0\u1edbc ki\u1ec3m th\u1eed th\u1ee7 c\u00f4ng g\u1ee3i \u00fd (m\u1ee5c 2 c\u1ee7a k\u1ebf ho\u1ea1ch ph\u1ea1m vi). */
export const PR_VIEW_MANUAL_QA_CHECKLIST: readonly string[] = [
  'PR m\u1edf + mergeable clean: t\u1ea3i \u0111\u01b0\u1ee3c th\u00f4ng tin, file, comment; Approve / Merge t\u1eeb app (n\u1ebfu quy\u1ec1n).',
  'PR draft: Merge v\u00e0 Approve b\u1ecb t\u1eaft ho\u1eb7c API t\u1eeb ch\u1ed1i; v\u1eabn \u0111\u1ecdc diff + conversation.',
  'PR \u0111\u00e3 merge ho\u1eb7c \u0111\u00e3 \u0111\u00f3ng: n\u00fat ph\u00f9 h\u1ee3p disabled; t\u1ea3i l\u1ecbch s\u1eed comment.',
  'PR conflict (mergeable dirty) ho\u1eb7c blocked: v\u1eabn xem diff/issue comments; merge/approve c\u00f3 th\u1ec3 l\u1ed7i \u2014 th\u00f4ng b\u00e1o t\u1eeb API.',
  'B\u00ecnh lu\u1eadn r\u1ed1ng: n\u00fat g\u1eedi b\u1ecb ch\u1eb7n ho\u1eb7c b\u1ecb t\u1eeb tr\u1edf h\u1ee3p l\u1ebd.',
  'Token h\u1ebft h\u1ea1n / thi\u1ebfu scope: th\u00f4ng b\u00e1o l\u1ed7i r\u00f5; c\u1ea7n c\u1ea5u h\u00ecnh l\u1ea1i PAT n\u1ebfu thi\u1ebfu quy\u1ec1n ghi comment ho\u1eb7c review.',
  'File patch b\u1ecb c\u1eaft (r\u1ea5t d\u00e0i): UI hi\u1ec7n c\u1ea3nh b\u00e1o v\u00e0 link xem tr\u00ean GitHub (tab Files).',
  'Cột merge_*: ô có PR kèm có thể bấm mở Pr Detail (vùng trạng thái + nút panel phải); ô Merged: mở trong app chủ yếu qua nút panel (có link # mở web).',
]

/**
 * C\u00e1c h\u01b0\u1edbng pha 2 (ch\u1ecdn m\u1ed9t, \u01b0u ti\u00ean ri\u00eang) \u2014 kh\u00f4ng tri\u1ec3n khai trong pha c\u1ee7ng c\u1ed1.
 */
export const PR_IN_APP_PHASE2_CANDIDATES: readonly { id: string; summary: string; scopeNote: string }[] = [
  {
    id: 'checks_summary',
    summary: 'T\u00f3m t\u1eaft checks/CI t\u1eeb head SHA (Check Runs / Check Suites)',
    scopeNote: 'C\u1ea7n th\u00eam endpoint Octokit v\u00e0 v\u00f2ng \u0111\u1eddi UI; kh\u00f4ng m\u1ee5c ti\u00eau parity \u0111\u1ee7 m\u1ecdc v\u1edbi tab Checks GitHub \u1edf b\u01b0\u1edbc \u0111\u1ea7u.',
  },
  {
    id: 'inline_review',
    summary: 'B\u00ecnh lu\u1eadn review theo d\u00f2ng (createReview + comment position/line)',
    scopeNote: 'Ph\u1ee5 thu\u1ed9c map file/tabs v\u1edbi diff; kh\u00e1c API v\u1edbi issue comments.',
  },
  {
    id: 'local_conflict_open',
    summary: 'B\u01b0\u1edbc 1 h\u1ed7 tr\u1ee3 conflict: m\u1edf th\u01b0 m\u1ee5c localPath repo / branch (kh\u00f4ng editor \u0111\u1ee7) ',
    scopeNote: 'D\u1eabn t\u1edbi c\u00f4ng c\u1ee5 ngo\u00e0i; editor t\u00edch h\u1ee3p to\u00e0n ph\u1ea7n l\u00e0 pha ri\u00eang l\u1edbn.',
  },
] as const
