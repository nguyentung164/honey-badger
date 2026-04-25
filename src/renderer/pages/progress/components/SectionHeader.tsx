import type { ReactNode } from 'react'

interface Props {
  icon: ReactNode
  title: string
  description?: string
  actions?: ReactNode
}

export function SectionHeader({ icon, title, description, actions }: Props) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
          {icon}
        </div>
        <div>
          <h2 className="text-base font-semibold leading-tight">{title}</h2>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
