import {
  getIconForDirectoryPath,
  getIconForFilePath,
  getIconUrlByName,
  isMaterialIconName,
  type MaterialIcon,
} from 'vscode-material-icons'

const MATERIAL_ICONS_BASE = `${import.meta.env.BASE_URL}material-icons`.replace(/\/$/, '')

const FALLBACK_FOLDER_OPEN_ICON: MaterialIcon = 'folder-open'

export function resolveMaterialFileIconName(filePath: string): MaterialIcon {
  return getIconForFilePath(filePath)
}

export function resolveMaterialFolderIconName(folderName: string, expanded = false): MaterialIcon {
  const closed = getIconForDirectoryPath(folderName)
  if (!expanded) return closed

  const openCandidate = `${closed}-open`
  if (isMaterialIconName(openCandidate)) return openCandidate
  if (closed === 'folder-root') return 'folder-root-open'
  return FALLBACK_FOLDER_OPEN_ICON
}

export function getMaterialIconUrl(iconName: MaterialIcon): string {
  return getIconUrlByName(iconName, MATERIAL_ICONS_BASE)
}
