import type * as React from 'react'

import { cn } from '@/lib/utils'

/** Sticky header cells: dùng với `<TableHeader sticky>` — sticky trên `th` để không bị wrapper overflow phá layout */
export const tableStickyHeaderCellClass =
  'sticky top-0 z-20 bg-[var(--table-header-bg)] shadow-[0_1px_0_0_var(--border)] !text-[var(--table-header-fg)]'

function Table({
  className,
  wrapperClassName,
  ...props
}: React.ComponentProps<'table'> & { wrapperClassName?: string }) {
  const tableEl = (
    <table
      data-slot="table"
      className={cn(
        'w-full caption-bottom text-sm border-separate border-spacing-0 [&_td]:align-middle [&_th]:align-middle',
        className
      )}
      {...props}
    />
  )
  if (wrapperClassName) {
    return (
      <div data-slot="table-container" className={cn('relative w-full', wrapperClassName)}>
        {tableEl}
      </div>
    )
  }
  return tableEl
}

function TableHeader({
  className,
  sticky,
  ...props
}: React.ComponentProps<'thead'> & { sticky?: boolean }) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        '[&_tr]:border-b [&>tr:hover]:bg-muted/40',
        sticky &&
          '[&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-[var(--table-header-bg)] [&_th]:shadow-[0_1px_0_0_var(--border)] [&_th]:!text-[var(--table-header-fg)]',
        className
      )}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn(
        '[&_tr:last-child]:border-0',
        '[&>tr:nth-child(odd)]:bg-muted/25 [&>tr:nth-child(even)]:bg-muted/45',
        '[&>tr:hover]:bg-muted/65',
        className
      )}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return <tfoot data-slot="table-footer" className={cn('bg-muted/50 border-t font-medium [&>tr]:last:border-b-0', className)} {...props} />
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn('border-b transition-colors data-[state=selected]:bg-muted', className)}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn('p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]', className)}
      {...props}
    />
  )
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return <caption data-slot="table-caption" className={cn('text-muted-foreground mt-4 text-sm', className)} {...props} />
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption }
