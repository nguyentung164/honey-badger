import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AutomationBrowser, TestProject } from 'shared/automation/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import toast from '@/components/ui-elements/Toast'
import { useAutomationStore } from '@/stores/useAutomationStore'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: TestProject | null
  onSaved: () => void
}

const ALL_BROWSERS: AutomationBrowser[] = ['chromium', 'firefox', 'webkit']

export function ProjectForm({ open, onOpenChange, initial, onSaved }: Props) {
  const { t } = useTranslation()
  const upsertProject = useAutomationStore(s => s.upsertProject)
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [description, setDescription] = useState('')
  const [browsers, setBrowsers] = useState<AutomationBrowser[]>(['chromium'])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setBaseUrl(initial?.baseUrl ?? '')
    setDescription(initial?.description ?? '')
    setBrowsers((initial?.browsers as AutomationBrowser[]) ?? ['chromium'])
    setError(null)
  }, [open, initial])

  const handleSave = async () => {
    setError(null)
    if (!name.trim()) {
      setError(t('automation.projects.errors.nameRequired'))
      return
    }
    if (!/^https?:\/\//i.test(baseUrl.trim())) {
      setError(t('automation.projects.errors.baseUrl'))
      return
    }
    if (browsers.length === 0) {
      setError(t('automation.projects.errors.browsers'))
      return
    }
    setSaving(true)
    try {
      const payload = { name: name.trim(), baseUrl: baseUrl.trim(), description: description.trim() || undefined, browsers }
      const res = initial
        ? await window.api.automation.project.update({ id: initial.id, patch: payload })
        : await window.api.automation.project.create(payload)
      if (res.status === 'success' && res.data) {
        upsertProject(res.data)
        toast.success(initial ? t('automation.projects.updated') : t('automation.projects.created'))
        onSaved()
      } else {
        setError(res.message ?? 'Failed')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? t('automation.projects.editTitle') : t('automation.projects.newTitle')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="auto-name">{t('automation.projects.fields.name')}</Label>
            <Input id="auto-name" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="auto-url">{t('automation.projects.fields.baseUrl')}</Label>
            <Input id="auto-url" placeholder="https://example.com" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>{t('automation.projects.fields.browsers')}</Label>
            <ToggleGroup
              type="multiple"
              value={browsers}
              onValueChange={(v: string[]) => setBrowsers(v as AutomationBrowser[])}
              variant="outline"
              size="sm"
              className="justify-start"
            >
              {ALL_BROWSERS.map(b => (
                <ToggleGroupItem key={b} value={b} className="uppercase">
                  {b}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="auto-desc">{t('automation.projects.fields.description')}</Label>
            <Textarea id="auto-desc" rows={3} value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          {error ? <div className="text-sm text-destructive">{error}</div> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('automation.common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t('automation.common.saving') : t('automation.common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
