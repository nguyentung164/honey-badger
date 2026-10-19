import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ChartContainer, ChartLegendContent, ChartStyle, ChartTooltipContent } from './chart'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => children,
  Tooltip: () => null,
  Legend: () => null,
}))

describe('Recharts 3 chart content', () => {
  it('renders light and dark color rules as style content', () => {
    const markup = renderToStaticMarkup(<ChartStyle id="chart-test" config={{ hours: { theme: { light: '#123456', dark: '#654321' } } }} />)
    expect(markup).toContain('[data-chart=chart-test] {\n  --color-hours: #123456;')
    expect(markup).toContain('.dark [data-chart=chart-test] {\n  --color-hours: #654321;')
  })

  it('passes the complete payload array to a custom tooltip formatter', () => {
    const payload = [
      { graphicalItemId: 'hours', dataKey: 'hours', name: 'hours', value: 0, payload: { fill: '#123456' } },
      { graphicalItemId: 'tasks', dataKey: 'tasks', name: 'tasks', value: 2, payload: { fill: '#654321' } },
    ]
    const formatter = vi.fn((value: unknown) => <span>{String(value)}</span>)
    const markup = renderToStaticMarkup(
      <ChartContainer config={{ hours: { label: 'Hours' }, tasks: { label: 'Tasks' } }}>
        <ChartTooltipContent active payload={payload} formatter={formatter} />
      </ChartContainer>
    )
    expect(formatter).toHaveBeenNthCalledWith(1, 0, 'hours', payload[0], 0, payload)
    expect(formatter).toHaveBeenNthCalledWith(2, 2, 'tasks', payload[1], 1, payload)
    expect(markup).toContain('<span>0</span>')
  })

  it('allows legend content to mount before Recharts injects its payload', () => {
    const markup = renderToStaticMarkup(
      <ChartContainer config={{ hours: { label: 'Hours' } }}>
        <ChartLegendContent />
      </ChartContainer>
    )
    expect(markup).toContain('data-slot="chart"')
    expect(markup).not.toContain('Hours')
  })
})
