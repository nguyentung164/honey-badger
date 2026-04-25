export interface BugInstance {
  id: string
  type: string
  priority: number
  rank: number
  abbrev: string
  category: string
  cweid?: number
  shortMessage: string
  longMessage: string
  classes: ClassInfo[]
  methods: MethodInfo[]
  fields: FieldInfo[]
  localVariables: LocalVariableInfo[]
  sourceLines: SourceLineInfo[]
  ints: IntInfo[]
  strings: StringInfo[]
  properties: PropertyInfo[]
  userAnnotation?: {
    designation: string
    user: string
    needsSync: boolean
    timestamp: number
    value: string
  }
  patternDetails?: {
    type: string
    abbrev: string
    category: string
    cweid?: number
    shortDescription: string
    details: string
  }
  categoryDetails?: {
    name: string
    description: string
    abbreviation: string
    details: string
  }
  codeDetails?: {
    abbrev: string
    cweid?: number
    description: string
  }

  // Các trường phụ thêm cho UI
  className?: string
  sourceFile?: string
  startLine?: number
  endLine?: number
  message?: string
  details?: string
  categoryDescription?: string
}

export interface SpotBugsResult {
  version: {
    version: string
    sequence: number | null
    timestamp: number | null
    analysisTimestamp: number | null
    release: string
  }
  project: {
    projectName: string
    filename: string
    jars: string[]
    srcDirs: string[]
    auxClasspathEntries?: string[]
    wrkDir?: string
  }
  summary: {
    timestamp: string
    totalClasses: number
    referencedClasses: number
    totalBugs: number
    totalSize: number
    numPackages: number
    javaVersion?: string
    vmVersion?: string
    cpuSeconds?: number | null
    clockSeconds?: number | null
    peakMbytes?: number | null
    allocMbytes?: number | null
    gcSeconds?: number | null
    priority1: number
    priority2: number
    priority3: number
  }
  fileStats: Array<{
    path: string
    bugCount: number
    size?: number | null
    bugHash?: string
  }>
  packageStats: Array<{
    packageName: string
    totalBugs: number
    totalTypes: number
    totalSize: number
    priority1: number
    priority2: number
    priority3: number
    classStats: Array<{
      className: string
      sourceFile?: string
      interface: boolean
      size: number
      bugs: number
      priority1: number
      priority2: number
      priority3: number
    }>
  }>
  errors: {
    errors: number
    missingClasses: number
    missingClassList: string[]
  }
  bugCategories: Record<string, any>
  bugPatterns: Record<string, any>
  bugCodes: Record<string, any>
  bugInstances: BugInstance[]
  bugCount: {
    total: number
    byPriority: {
      high: number
      medium: number
      low: number
    }
  }
}

interface SourceLineInfo {
  classname: string
  start: number | null
  end: number | null
  startBytecode?: number | null
  endBytecode?: number | null
  sourcefile: string
  sourcepath: string
  relSourcepath?: string
  synthetic?: boolean
  role?: string
  primary?: boolean
  message?: string
}

interface MethodInfo {
  classname: string
  name: string
  signature: string
  isStatic: boolean
  role?: string
  primary?: boolean
  sourceLine: SourceLineInfo | null
  message?: string
}

interface FieldInfo {
  classname: string
  name: string
  signature: string
  sourceSignature?: string
  isStatic: boolean
  role?: string
  primary?: boolean
  sourceLine?: SourceLineInfo | null
  message?: string
}

interface LocalVariableInfo {
  name: string
  register?: number | null
  pc?: number | null
  role?: string
  message?: string
}

interface PropertyInfo {
  name: string
  value: string
}

interface IntInfo {
  value: number | null
  role?: string
  message?: string
}

interface StringInfo {
  value: string
  role?: string
  message?: string
}

interface ClassInfo {
  classname: string
  role?: string
  primary?: boolean
  sourceLine?: SourceLineInfo | null
  message?: string
}
