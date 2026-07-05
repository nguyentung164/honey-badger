import type { TFunction } from 'i18next'
import type { EditorSettings } from '@/pages/editor/hooks/useEditorSettings'

/** Non-visual editor settings surfaced as footer labels in the settings preview. */
export function collectEditorSettingsPreviewBehaviorHints(
  settings: EditorSettings,
  t: TFunction,
  scope: 'monaco' | 'workbench'
): string[] {
  const hints = [
    settings.formatOnSave ? t('editor.settings.formatOnSave') : null,
    settings.trimTrailingWhitespaceOnSave ? t('editor.settings.trimTrailingWhitespaceOnSave') : null,
    settings.insertFinalNewlineOnSave ? t('editor.settings.insertFinalNewlineOnSave') : null,
    settings.formatOnPaste ? t('editor.settings.formatOnPaste') : null,
    settings.dragAndDrop ? t('editor.settings.dragAndDrop') : null,
    settings.detectIndentation ? t('editor.settings.detectIndentation') : null,
    settings.smoothScrolling ? t('editor.settings.smoothScrolling') : null,
  ]

  if (scope === 'monaco' && settings.linkedEditing && settings.previewSampleLanguage === 'html') {
    hints.push(t('editor.settings.linkedEditing'))
  }

  if (scope === 'monaco' && settings.linkedEditing && settings.previewSampleLanguage !== 'html') {
    hints.push(t('editor.settings.previewLinkedEditingHtmlHint'))
  }

  return hints.filter((label): label is string => Boolean(label))
}
