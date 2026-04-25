'use client'

import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Pagination,
  PaginationContent,
  PaginationFirst,
  PaginationItem,
  PaginationLast,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getVisiblePageNumbers } from '@/lib/paginationUtils'
import { cn } from '@/lib/utils'
import { useButtonVariant } from '@/stores/useAppearanceStore'

export const DEFAULT_TABLE_PAGE_SIZE_OPTIONS = [25, 50, 100] as const

export type TablePaginationBarProps = {
  className?: string
  page: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizeOptions?: readonly number[]
  showPageSize?: boolean
  /** Nội dung thay thế block trái (info + select). Khi set, bỏ qua showing mặc định & select page size trong block trái. */
  leftSlot?: ReactNode
}

function clampPage(p: number, total: number): number {
  if (total <= 0) return 1
  return Math.min(Math.max(1, Math.floor(p)), total)
}

export function TablePaginationBar({
  className,
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_TABLE_PAGE_SIZE_OPTIONS,
  showPageSize,
  leftSlot,
}: TablePaginationBarProps) {
  const { t } = useTranslation()
  const buttonVariant = useButtonVariant()
  const effectiveShowPageSize = showPageSize ?? onPageSizeChange != null
  const from = totalItems <= 0 ? 0 : (page - 1) * pageSize + 1
  const to = totalItems <= 0 ? 0 : Math.min(page * pageSize, totalItems)

  const visiblePages = useMemo(() => getVisiblePageNumbers(page, totalPages, 5), [page, totalPages])

  const [jumpValue, setJumpValue] = useState(String(page))
  useEffect(() => {
    setJumpValue(String(page))
  }, [page])

  const applyJump = useCallback(() => {
    const n = Number.parseInt(jumpValue.trim(), 10)
    if (Number.isNaN(n)) return
    onPageChange(clampPage(n, totalPages))
  }, [jumpValue, onPageChange, totalPages])

  const navDisabled = totalPages <= 1

  if (totalItems <= 0) {
    return null
  }

  return (
    <div className={cn('shrink-0 w-full min-w-0 grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 gap-y-1', className)}>
      <div className="flex min-w-0 items-center gap-3 justify-self-start">
        {leftSlot ?? (
          <>
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {t('taskManagement.showing', { from, to, total: totalItems })}
            </span>
            {effectiveShowPageSize && onPageSizeChange ? (
              <>
                <Select value={String(pageSize)} onValueChange={v => onPageSizeChange(Number(v))}>
                  <SelectTrigger className="w-[90px]" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pageSizeOptions.map(n => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground whitespace-nowrap">{t('taskManagement.perPage', 'per page')}</span>
              </>
            ) : null}
          </>
        )}
      </div>

      <div className="justify-self-center min-w-0">
        <Pagination className="mx-0 w-auto max-w-none justify-center">
          <PaginationContent>
            <PaginationItem>
              <PaginationFirst
                href="#"
                onClick={e => {
                  e.preventDefault()
                  if (!navDisabled) onPageChange(1)
                }}
                className={navDisabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={e => {
                  e.preventDefault()
                  if (page > 1) onPageChange(page - 1)
                }}
                className={page <= 1 || navDisabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
            {visiblePages.map(pageNum => (
              <PaginationItem key={pageNum}>
                <PaginationLink
                  href="#"
                  isActive={pageNum === page}
                  onClick={e => {
                    e.preventDefault()
                    onPageChange(pageNum)
                  }}
                  className="cursor-pointer"
                >
                  {pageNum}
                </PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={e => {
                  e.preventDefault()
                  if (page < totalPages) onPageChange(page + 1)
                }}
                className={page >= totalPages || navDisabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
            <PaginationItem>
              <PaginationLast
                href="#"
                onClick={e => {
                  e.preventDefault()
                  if (!navDisabled) onPageChange(clampPage(totalPages, totalPages))
                }}
                className={navDisabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>

      <div className="flex min-w-0 items-center gap-2 justify-self-end justify-end">
        <span className="text-sm text-muted-foreground whitespace-nowrap hidden sm:inline">{t('pagination.jumpPage')}</span>
        <Input
          type="number"
          min={1}
          max={Math.max(1, totalPages)}
          className="h-8 w-16 text-center px-1 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
          aria-label={t('pagination.jumpPage')}
          placeholder={t('pagination.pageNumberPlaceholder')}
          value={jumpValue}
          disabled={totalPages <= 0}
          onChange={e => setJumpValue(e.target.value)}
        />
        <Button type="button" variant={buttonVariant} size="sm" className="h-8 shrink-0" onClick={() => applyJump()} disabled={totalPages <= 0}>
          {t('pagination.go')}
        </Button>
      </div>
    </div>
  )
}
