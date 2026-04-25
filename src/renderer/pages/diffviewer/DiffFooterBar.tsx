'use client'
import { Check } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const languages = [
  { label: 'ABAP', value: 'abap' },
  { label: 'Apex', value: 'apex' },
  { label: 'AZ CLI', value: 'azcli' },
  { label: 'Batch', value: 'bat' },
  { label: 'C', value: 'c' },
  { label: 'C++', value: 'cpp' },
  { label: 'C#', value: 'csharp' },
  { label: 'CSS', value: 'css' },
  { label: 'Dart', value: 'dart' },
  { label: 'Dockerfile', value: 'dockerfile' },
  { label: 'F#', value: 'fsharp' },
  { label: 'Go', value: 'go' },
  { label: 'GraphQL', value: 'graphql' },
  { label: 'Handlebars', value: 'handlebars' },
  { label: 'HTML', value: 'html' },
  { label: 'INI', value: 'ini' },
  { label: 'Java', value: 'java' },
  { label: 'JavaScript', value: 'javascript' },
  { label: 'JSON', value: 'json' },
  { label: 'Kotlin', value: 'kotlin' },
  { label: 'Less', value: 'less' },
  { label: 'Lua', value: 'lua' },
  { label: 'Markdown', value: 'markdown' },
  { label: 'Objective-C', value: 'objective-c' },
  { label: 'Perl', value: 'perl' },
  { label: 'PHP', value: 'php' },
  { label: 'PowerShell', value: 'powershell' },
  { label: 'Python', value: 'python' },
  { label: 'R', value: 'r' },
  { label: 'Ruby', value: 'ruby' },
  { label: 'Rust', value: 'rust' },
  { label: 'SCSS', value: 'scss' },
  { label: 'Shell Script', value: 'shell' },
  { label: 'SQL', value: 'sql' },
  { label: 'Swift', value: 'swift' },
  { label: 'TypeScript', value: 'typescript' },
  { label: 'VB.NET', value: 'vb' },
  { label: 'XML', value: 'xml' },
  { label: 'YAML', value: 'yaml' },
  { label: 'Plain Text', value: 'plaintext' },
]

export function DiffFooterBar({
  language,
  setLanguage,
  cursorPosition,
}: {
  language: string
  setLanguage: (lang: string) => void
  cursorPosition?: { line: number; column: number }
}) {
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()
  return (
    <div className="flex h-7 items-center gap-4 border-t bg-muted/50 px-4 text-[10px]">
      {/* File info */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <span>{t('label.line')}</span>
          <span>{cursorPosition?.line ?? 1}</span>
        </div>
        <div className="flex items-center gap-1">
          <span>{t('label.column')}</span>
          <span>{cursorPosition?.column ?? 1}</span>
        </div>
      </div>

      {/* Language selector */}
      <div className="ml-auto flex items-center">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" aria-expanded={open} className="h-6 justify-between border-0 rounded-none text-[10px]">
              {languages.find(item => item.value === language)?.label ?? t('dialog.diffViewer.language.select')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[120px] p-0">
            <Command>
              <CommandInput placeholder={t('placeholder.search')} />
              <CommandList>
                <CommandEmpty>{t('dialog.diffViewer.language.notFound')}</CommandEmpty>
                <CommandGroup>
                  {languages.map(lang => (
                    <CommandItem
                      key={lang.value}
                      value={lang.value}
                      onSelect={currentValue => {
                        setLanguage(currentValue)
                        setOpen(false)
                      }}
                    >
                      {lang.label}
                      <Check className={cn('ml-auto h-4 w-4', language === lang.value ? 'opacity-100' : 'opacity-0')} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
