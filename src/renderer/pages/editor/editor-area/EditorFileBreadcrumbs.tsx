'use client'

import { Fragment, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { MaterialFileIcon } from '@/components/icons/MaterialFileIcon'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { cn } from '@/lib/utils'

type EditorFileBreadcrumbsProps = {
  relativePath: string
  workspaceLabel: string
  onRevealPath?: (relativePath: string) => void
  className?: string
}

export function EditorFileBreadcrumbs({ relativePath, workspaceLabel, onRevealPath, className }: EditorFileBreadcrumbsProps) {
  const { t } = useTranslation()

  const { dirs, fileName } = useMemo(() => {
    const parts = relativePath.split('/').filter(Boolean)
    if (parts.length === 0) return { dirs: [] as string[], fileName: '' }
    return { dirs: parts.slice(0, -1), fileName: parts[parts.length - 1] }
  }, [relativePath])

  if (!fileName) return null

  const reveal = onRevealPath
  const segmentButtonClass = 'max-w-[8rem] truncate text-left'

  return (
    <div className={cn('shrink-0 overflow-x-auto border-b border-border/60 bg-muted/15', className)}>
      <Breadcrumb className="px-3 py-1 h-[21.5px]" aria-label={t('editor.breadcrumbs.aria')}>
        <BreadcrumbList className="flex-nowrap gap-1 text-xs sm:gap-1.5">
          <BreadcrumbItem>
            {reveal ? (
              <BreadcrumbLink asChild>
                <button
                  type="button"
                  className={cn(segmentButtonClass, 'max-w-[10rem] text-muted-foreground')}
                  title={workspaceLabel}
                  onClick={() => reveal('')}
                >
                  {workspaceLabel}
                </button>
              </BreadcrumbLink>
            ) : (
              <span className="max-w-[10rem] truncate text-muted-foreground" title={workspaceLabel}>
                {workspaceLabel}
              </span>
            )}
          </BreadcrumbItem>
          {dirs.map((dir, index) => {
            const segmentPath = dirs.slice(0, index + 1).join('/')
            return (
              <Fragment key={`${index}-${dir}`}>
                <BreadcrumbSeparator className="text-muted-foreground/50" />
                <BreadcrumbItem>
                  {reveal ? (
                    <BreadcrumbLink asChild>
                      <button
                        type="button"
                        className={cn(segmentButtonClass, 'text-muted-foreground')}
                        title={dir}
                        onClick={() => reveal(segmentPath)}
                      >
                        {dir}
                      </button>
                    </BreadcrumbLink>
                  ) : (
                    <span className={cn(segmentButtonClass, 'text-muted-foreground')} title={dir}>
                      {dir}
                    </span>
                  )}
                </BreadcrumbItem>
              </Fragment>
            )
          })}
          <BreadcrumbSeparator className="text-muted-foreground/50" />
          <BreadcrumbItem>
            {reveal ? (
              <BreadcrumbLink asChild>
                <button
                  type="button"
                  className="flex max-w-[16rem] items-center gap-1 font-normal text-foreground"
                  title={fileName}
                  onClick={() => reveal(relativePath)}
                >
                  <MaterialFileIcon name={fileName} size={14} className="h-3.5 w-3.5" />
                  <span className="truncate">{fileName}</span>
                </button>
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage className="flex max-w-[16rem] items-center gap-1 font-normal">
                <MaterialFileIcon name={fileName} size={14} className="h-3.5 w-3.5" />
                <span className="truncate" title={fileName}>
                  {fileName}
                </span>
              </BreadcrumbPage>
            )}
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  )
}
