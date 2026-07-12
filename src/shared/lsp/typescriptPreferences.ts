/** VS Code `typescript.preferGoToSourceDefinition` + tsgo `userPreferences` / workspace settings. */
export type TypeScriptUserPreferencesInput = {
  preferGoToSourceDefinition: boolean
}

export function buildTypeScriptWorkspaceSettings(input: TypeScriptUserPreferencesInput): Record<string, Record<string, unknown>> {
  const jsTs = {
    preferGoToSourceDefinition: input.preferGoToSourceDefinition,
    importModuleSpecifierPreference: 'relative' as const,
    includeInlayParameterNameHints: 'all' as const,
    includeInlayVariableTypeHints: true,
    includeInlayPropertyDeclarationTypeHints: true,
    includeInlayFunctionLikeReturnTypeHints: true,
    includeInlayEnumMemberValueHints: true,
  }
  return {
    'js/ts': jsTs,
    typescript: { preferGoToSourceDefinition: input.preferGoToSourceDefinition },
    javascript: { preferGoToSourceDefinition: input.preferGoToSourceDefinition },
  }
}

/** typescript-go native LSP `initializationOptions.userPreferences`. */
export function buildTypeScriptNativeInitUserPreferences(input: TypeScriptUserPreferencesInput): Record<string, unknown> {
  return buildTypeScriptWorkspaceSettings(input)['js/ts']!
}

/** typescript-language-server `initializationOptions.preferences`. */
export function buildTypeScriptTlsInitPreferences(input: TypeScriptUserPreferencesInput): Record<string, unknown> {
  return buildTypeScriptNativeInitUserPreferences(input)
}
