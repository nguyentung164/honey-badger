export type FileTreeNode = {
  relativePath: string
  name: string
  kind: 'file' | 'directory'
  childrenLoaded: boolean
  children: FileTreeNode[]
}

export type FileTreeRow =
  | { type: 'directory'; node: FileTreeNode; depth: number }
  | { type: 'file'; node: FileTreeNode; depth: number }

export function flattenFileTree(
  root: FileTreeNode,
  expandedPaths: ReadonlySet<string>
): FileTreeRow[] {
  const rows: FileTreeRow[] = []

  const walk = (node: FileTreeNode, depth: number) => {
    if (node.relativePath !== '') {
      rows.push({ type: node.kind, node, depth })
    }
    if (node.kind !== 'directory' || !expandedPaths.has(node.relativePath)) return
    for (const child of node.children) {
      walk(child, depth + 1)
    }
  }

  walk(root, -1)
  return rows
}

export function upsertTreeChildren(root: FileTreeNode, parentPath: string, children: FileTreeNode[]): FileTreeNode {
  if (parentPath === '') {
    return { ...root, children, childrenLoaded: true }
  }

  const update = (node: FileTreeNode): FileTreeNode => {
    if (node.relativePath === parentPath) {
      return { ...node, children, childrenLoaded: true }
    }
    if (!node.children.length) return node
    return { ...node, children: node.children.map(update) }
  }

  return update(root)
}

export function createEmptyRoot(): FileTreeNode {
  return { relativePath: '', name: '', kind: 'directory', childrenLoaded: false, children: [] }
}
