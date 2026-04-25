import { exec } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import l from 'electron-log'
import { XMLParser } from 'fast-xml-parser'
import configurationStore from '../store/ConfigurationStore'

const execPromise = promisify(exec)
const getSpotBugsPath = () => {
  if (process.env.NODE_ENV === 'development') {
    return path.resolve(process.cwd(), 'spotbugs-4.9.3')
  }
  // Trong môi trường sản phẩm, tìm trong thư mục resources
  return path.join(process.resourcesPath, 'spotbugs-4.9.3')
}

/**
 * Run SpotBugs on Java files
 * @param filePaths Array of Java file paths to analyze
 * @returns Promise with analysis results
 */
export async function runSpotBugs(filePaths: string[]): Promise<any> {
  try {
    const { sourceFolder } = configurationStore.store
    const javaFiles = filePaths.filter(file => file.endsWith('.java'))
    if (javaFiles.length === 0) {
      return { status: 'error', message: 'No Java files to analyze' }
    }
    const tempDir = path.join(app.getPath('temp'), 'spotbugs-temp')
    const outputDir = path.join(tempDir, 'output')
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }
    const basePath = sourceFolder?.trim() || process.cwd()
    const absolutePaths = javaFiles.map(file => (path.isAbsolute(file) ? file : path.resolve(basePath, file)))
    const spotbugsPath = getSpotBugsPath()
    const spotbugsExecutable = process.platform === 'win32' ? path.join(spotbugsPath, 'bin', 'spotbugs.bat') : path.join(spotbugsPath, 'bin', 'spotbugs')
    if (!fs.existsSync(spotbugsExecutable)) {
      return {
        status: 'error',
        message: `SpotBugs executable not found at: ${spotbugsExecutable}`,
      }
    }
    const outputXml = path.join(outputDir, 'spotbugs-result.xml')
    l.info('Looking for corresponding class files for the selected Java files')
    let projectBaseDir = basePath
    if (absolutePaths.length > 0) {
      const firstFilePath = absolutePaths[0]
      const firstFileDir = path.dirname(firstFilePath)
      const pathParts = firstFileDir.split(path.sep)
      const srcIndex = pathParts.findIndex(part => part === 'src' || part === 'java')
      if (srcIndex >= 0) {
        projectBaseDir = pathParts.slice(0, srcIndex).join(path.sep)
      }
    }
    l.info(`Detected project base directory: ${projectBaseDir}`)
    const possibleClassDirs = [
      path.join(projectBaseDir, 'target', 'classes'),
      path.join(projectBaseDir, 'build', 'classes'),
      path.join(projectBaseDir, 'build', 'classes', 'java', 'main'),
      path.join(projectBaseDir, 'bin'),
      path.join(projectBaseDir, 'out', 'production'),
      path.join(projectBaseDir, 'classes'),
      path.join(projectBaseDir, 'build'),
      path.join(projectBaseDir, 'target'),
      sourceFolder,
    ]
    let classDir = ''
    let foundClassFiles = false
    const classFilePaths: string[] = []
    for (const dir of possibleClassDirs) {
      if (fs.existsSync(dir)) {
        l.info(`Found potential class directory: ${dir}`)
        classDir = dir
        break
      }
    }
    if (!classDir) {
      l.warn('Could not find any class directory')
      return {
        status: 'error',
        message: 'Could not find any class directory. Please make sure your project is compiled.',
      }
    }
    for (const javaFilePath of absolutePaths) {
      const javaFileName = path.basename(javaFilePath, '.java')
      const packageMatch = fs.readFileSync(javaFilePath, 'utf-8').match(/package\s+([^;]+);/)
      const packageName = packageMatch ? packageMatch[1] : ''
      let classFilePath = ''
      if (packageName) {
        const packagePath = packageName.replace(/\./g, path.sep)
        classFilePath = path.join(classDir, packagePath, `${javaFileName}.class`)
      } else {
        classFilePath = path.join(classDir, `${javaFileName}.class`)
      }
      if (fs.existsSync(classFilePath)) {
        l.info(`Found class file for ${javaFileName}: ${classFilePath}`)
        classFilePaths.push(classFilePath)
        foundClassFiles = true
      } else {
        l.info(`Searching for ${javaFileName}.class in ${classDir}...`)
        const findClassFile = (dir: string, className: string): string | null => {
          const files = fs.readdirSync(dir)
          for (const file of files) {
            const filePath = path.join(dir, file)
            const stat = fs.statSync(filePath)
            if (stat.isDirectory()) {
              const found = findClassFile(filePath, className)
              if (found) return found
            } else if (file === `${className}.class`) {
              return filePath
            }
          }
          return null
        }
        const foundClassFile = findClassFile(classDir, javaFileName)
        if (foundClassFile) {
          l.info(`Found class file for ${javaFileName}: ${foundClassFile}`)
          classFilePaths.push(foundClassFile)
          foundClassFiles = true
        } else {
          l.warn(`Could not find class file for ${javaFileName}`)
        }
      }
    }
    if (!foundClassFiles) {
      l.warn('Could not find any class files for the selected Java files')
      return {
        status: 'error',
        message: 'Could not find any class files for the selected Java files. Please make sure your project is compiled.',
      }
    }
    const classFileListPath = path.join(tempDir, 'class-files-to-analyze.txt')
    fs.writeFileSync(classFileListPath, classFilePaths.join('\n'))
    l.info(`Running SpotBugs on ${classFilePaths.length} class files`)
    const sourcepathArg = basePath?.trim() ? `-sourcepath "${basePath}"` : ''
    const inlineArgs = classFilePaths.map(file => `"${file}"`).join(' ')
    const baseCommand = `"${spotbugsExecutable}" -textui -xml:withMessages -output "${outputXml}" ${sourcepathArg} -nested:true -low`
    const WIN_CMD_LIMIT = 30000
    let command: string
    if (process.platform === 'win32' && (baseCommand + ' ' + inlineArgs).length > WIN_CMD_LIMIT) {
      const responseFilePath = path.join(tempDir, 'spotbugs-args.txt')
      fs.writeFileSync(responseFilePath, classFilePaths.join('\n'))
      command = `${baseCommand} @"${responseFilePath}"`
      l.info(`Command too long (${(baseCommand + ' ' + inlineArgs).length} chars), using response file: ${responseFilePath}`)
    } else {
      command = `${baseCommand} ${inlineArgs}`
    }
    l.info('Running SpotBugs command:', command)
    const { stdout, stderr } = await execPromise(command)
    if (stderr) {
      l.error('SpotBugs stderr:', stderr)
    }
    l.info('SpotBugs stdout:', stdout)
    if (!fs.existsSync(outputXml)) {
      return {
        status: 'error',
        message: 'SpotBugs analysis failed to generate output file',
      }
    }
    const xmlContent = fs.readFileSync(outputXml, 'utf-8')
    l.info(xmlContent)
    const note = `Note: SpotBugs analysis was performed on the compiled class files.
    This provides more accurate results than analyzing source files directly.`
    l.info(note)
    return {
      status: 'success',
      data: xmlContent,
      analyzedFiles: javaFiles,
    }
  } catch (error) {
    l.error('Error running SpotBugs:', error)
    return {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
/**
 * Parse SpotBugs XML result into a more usable format
 * @param xmlContent SpotBugs XML output
 * @returns Parsed bug instances
 */
export function parseSpotBugsResult(xmlContent: string): any {
  try {
    l.info('Parsing SpotBugs XML result...')
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      parseTagValue: false,
      parseAttributeValue: true,
      allowBooleanAttributes: true,
      trimValues: true,
    })
    const jsonObj = parser.parse(xmlContent)
    const bugCollection = jsonObj?.BugCollection
    l.info('Parsed BugCollection')
    if (!bugCollection) {
      throw new Error('Missing BugCollection root element')
    }

    // Thông tin phiên bản
    const version = {
      version: bugCollection.version || '',
      sequence: bugCollection.sequence ? Number(bugCollection.sequence) : null,
      timestamp: bugCollection.timestamp ? Number(bugCollection.timestamp) : null,
      analysisTimestamp: bugCollection.analysisTimestamp ? Number(bugCollection.analysisTimestamp) : null,
      release: bugCollection.release || '',
    }

    // Phân tích thông tin dự án
    const project = bugCollection.Project || {}
    const projectInfo = {
      projectName: project.projectName || '',
      filename: project.filename || '',
      jars: Array.isArray(project.Jar) ? project.Jar : project.Jar ? [project.Jar] : [],
      srcDirs: Array.isArray(project.SrcDir) ? project.SrcDir : project.SrcDir ? [project.SrcDir] : [],
      auxClasspathEntries: Array.isArray(project.AuxClasspathEntry) ? project.AuxClasspathEntry : project.AuxClasspathEntry ? [project.AuxClasspathEntry] : [],
      wrkDir: project.WrkDir || '',
    }

    // Phân tích danh mục lỗi
    const bugCategories: Record<string, any> = {}
    const bugCategoryList = bugCollection.BugCategory ? (Array.isArray(bugCollection.BugCategory) ? bugCollection.BugCategory : [bugCollection.BugCategory]) : []

    for (const category of bugCategoryList) {
      if (category) {
        const { category: categoryName, Description, Abbreviation, Details } = category
        bugCategories[categoryName] = {
          name: categoryName,
          description: Description || '',
          abbreviation: Abbreviation || '',
          details: Details || '',
        }
      }
    }
    l.info(`Found ${Object.keys(bugCategories).length} bug categories`)

    // Phân tích mẫu lỗi
    const bugPatterns: Record<string, any> = {}
    const bugPatternList = bugCollection.BugPattern ? (Array.isArray(bugCollection.BugPattern) ? bugCollection.BugPattern : [bugCollection.BugPattern]) : []

    for (const bugPattern of bugPatternList) {
      if (bugPattern) {
        const { type, abbrev, category, cweid, ShortDescription, Details } = bugPattern
        const details = Details?.['#text'] || Details?.CDATA || Details || ''
        bugPatterns[type] = {
          type,
          abbrev: abbrev || '',
          category: category || '',
          cweid: cweid ? Number(cweid) : null,
          shortDescription: ShortDescription || '',
          details: details.trim?.() || '',
        }
      }
    }
    l.info(`Found ${Object.keys(bugPatterns).length} bug patterns`)

    // Phân tích mã lỗi
    const bugCodes: Record<string, any> = {}
    const bugCodeList = bugCollection.BugCode ? (Array.isArray(bugCollection.BugCode) ? bugCollection.BugCode : [bugCollection.BugCode]) : []

    for (const bugCode of bugCodeList) {
      if (bugCode) {
        const { abbrev, cweid, Description } = bugCode
        bugCodes[abbrev] = {
          abbrev,
          cweid: cweid ? Number(cweid) : null,
          description: Description || '',
        }
      }
    }
    l.info(`Found ${Object.keys(bugCodes).length} bug codes`)

    // Phân tích các lỗi
    const bugInstances: any[] = []
    const rawBugInstances = bugCollection.BugInstance
    const bugInstanceList: any[] = Array.isArray(rawBugInstances)
      ? rawBugInstances
      : rawBugInstances
        ? [rawBugInstances]
        : []
    bugInstanceList.forEach((instance: any, index: number) => {
      if (!instance) return

      const {
        type,
        priority,
        rank,
        abbrev,
        category,
        cweid,
        instanceHash,
        ShortMessage,
        LongMessage,
        Class,
        Method,
        Field,
        LocalVariable,
        SourceLine,
        Int,
        String: StringValue,
        Property,
        UserAnnotation,
      } = instance

      const id = instanceHash || `BUG-${index + 1}`

      // Xử lý thông tin lớp
      const classList = Class ? (Array.isArray(Class) ? Class : [Class]) : []
      const classes = classList.map((c: any) => ({
        classname: c?.classname || '',
        role: c?.role || '',
        primary: c?.primary || false,
        sourceLine: c?.SourceLine
          ? {
              classname: c.SourceLine?.classname,
              start: c.SourceLine?.start ? Number(c.SourceLine.start) : null,
              end: c.SourceLine?.end ? Number(c.SourceLine.end) : null,
              startBytecode: c.SourceLine?.startBytecode ? Number(c.SourceLine.startBytecode) : null,
              endBytecode: c.SourceLine?.endBytecode ? Number(c.SourceLine.endBytecode) : null,
              sourcefile: c.SourceLine?.sourcefile || '',
              sourcepath: c.SourceLine?.sourcepath || '',
              relSourcepath: c.SourceLine?.relSourcepath || '',
              synthetic: c.SourceLine?.synthetic || false,
              role: c.SourceLine?.role || '',
              primary: c.SourceLine?.primary || false,
              message: c.SourceLine?.Message || '',
            }
          : null,
        message: c?.Message || '',
      }))

      // Xử lý thông tin phương thức
      const methodList = Method ? (Array.isArray(Method) ? Method : [Method]) : []
      const methods = methodList.map((m: any) => ({
        classname: m?.classname || '',
        name: m?.name || '',
        signature: m?.signature || '',
        isStatic: m?.isStatic || false,
        role: m?.role || '',
        primary: m?.primary || false,
        sourceLine: m?.SourceLine
          ? {
              classname: m.SourceLine?.classname,
              start: m.SourceLine?.start ? Number(m.SourceLine.start) : null,
              end: m.SourceLine?.end ? Number(m.SourceLine.end) : null,
              startBytecode: m.SourceLine?.startBytecode ? Number(m.SourceLine.startBytecode) : null,
              endBytecode: m.SourceLine?.endBytecode ? Number(m.SourceLine.endBytecode) : null,
              sourcefile: m.SourceLine?.sourcefile || '',
              sourcepath: m.SourceLine?.sourcepath || '',
              relSourcepath: m.SourceLine?.relSourcepath || '',
              synthetic: m.SourceLine?.synthetic || false,
              role: m.SourceLine?.role || '',
              primary: m.SourceLine?.primary || false,
              message: m.SourceLine?.Message || '',
            }
          : null,
        message: m?.Message || '',
      }))

      // Xử lý thông tin trường
      const fieldList = Field ? (Array.isArray(Field) ? Field : [Field]) : []
      const fields = fieldList.map((f: any) => ({
        classname: f?.classname || '',
        name: f?.name || '',
        signature: f?.signature || '',
        sourceSignature: f?.sourceSignature || '',
        isStatic: f?.isStatic || false,
        role: f?.role || '',
        primary: f?.primary || false,
        sourceLine: f?.SourceLine
          ? {
              classname: f.SourceLine?.classname,
              start: f.SourceLine?.start ? Number(f.SourceLine.start) : null,
              end: f.SourceLine?.end ? Number(f.SourceLine.end) : null,
              sourcefile: f.SourceLine?.sourcefile || '',
              sourcepath: f.SourceLine?.sourcepath || '',
              message: f.SourceLine?.Message || '',
            }
          : null,
        message: f?.Message || '',
      }))

      // Xử lý thông tin biến cục bộ
      const localVariableList = LocalVariable ? (Array.isArray(LocalVariable) ? LocalVariable : [LocalVariable]) : []
      const localVariables = localVariableList.map((lv: any) => ({
        name: lv?.name || '',
        register: lv?.register ? Number(lv.register) : null,
        pc: lv?.pc ? Number(lv.pc) : null,
        role: lv?.role || '',
        message: lv?.Message || '',
      }))

      // Xử lý thuộc tính
      const propertyList = Property ? (Array.isArray(Property) ? Property : [Property]) : []
      const properties = propertyList.map((p: any) => ({
        name: p?.name || '',
        value: p?.value || '',
      }))

      // Xử lý giá trị Int
      const intList = Int ? (Array.isArray(Int) ? Int : [Int]) : []
      const ints = intList.map((i: any) => ({
        value: i?.value ? Number(i.value) : null,
        role: i?.role || '',
        message: i?.Message || '',
      }))

      // Xử lý giá trị String
      const stringList = StringValue ? (Array.isArray(StringValue) ? StringValue : [StringValue]) : []
      const strings = stringList.map((s: any) => ({
        value: s?.value || '',
        role: s?.role || '',
        message: s?.Message || '',
      }))

      // Xử lý thông tin dòng mã nguồn
      const sourceLineList = SourceLine ? (Array.isArray(SourceLine) ? SourceLine : [SourceLine]) : []
      const sourceLines = sourceLineList.map((sl: any) => ({
        classname: sl?.classname || '',
        start: sl?.start ? Number(sl.start) : null,
        end: sl?.end ? Number(sl.end) : null,
        startBytecode: sl?.startBytecode ? Number(sl.startBytecode) : null,
        endBytecode: sl?.endBytecode ? Number(sl.endBytecode) : null,
        sourcefile: sl?.sourcefile || '',
        sourcepath: sl?.sourcepath || '',
        relSourcepath: sl?.relSourcepath || '',
        synthetic: sl?.synthetic || false,
        role: sl?.role || '',
        primary: sl?.primary || false,
        message: sl?.Message || '',
      }))

      // Xử lý chú thích người dùng
      const userAnnotation = UserAnnotation
        ? {
            designation: UserAnnotation.designation || '',
            user: UserAnnotation.user || '',
            needsSync: UserAnnotation.needsSync || false,
            timestamp: UserAnnotation.timestamp ? Number(UserAnnotation.timestamp) : null,
            value: UserAnnotation['#text'] || UserAnnotation.CDATA || '',
          }
        : null

      // Tạo đối tượng lỗi
      const bugData = {
        id,
        type,
        priority: priority ? Number(priority) : null,
        rank: rank ? Number(rank) : null,
        abbrev: abbrev || '',
        category: category || '',
        cweid: cweid ? Number(cweid) : null,
        shortMessage: ShortMessage || '',
        longMessage: LongMessage || '',
        classes,
        methods,
        fields,
        localVariables,
        sourceLines,
        ints,
        strings,
        properties,
        userAnnotation,

        // Thông tin bổ sung từ các định nghĩa
        patternDetails: bugPatterns[type] || null,
        categoryDetails: bugCategories[category] || null,
        codeDetails: bugCodes[abbrev] || null,
      }

      bugInstances.push(bugData)
    })

    l.info(`Found ${bugInstances.length} bug instances`)

    // Phân tích tóm tắt
    const findBugsSummary = bugCollection.FindBugsSummary || {}

    // Thông tin tóm tắt
    const summary = {
      timestamp: findBugsSummary.timestamp || '',
      totalClasses: findBugsSummary.total_classes ? Number(findBugsSummary.total_classes) : 0,
      referencedClasses: findBugsSummary.referenced_classes ? Number(findBugsSummary.referenced_classes) : 0,
      totalBugs: findBugsSummary.total_bugs ? Number(findBugsSummary.total_bugs) : bugInstances.length,
      totalSize: findBugsSummary.total_size ? Number(findBugsSummary.total_size) : 0,
      numPackages: findBugsSummary.num_packages ? Number(findBugsSummary.num_packages) : 0,
      javaVersion: findBugsSummary.java_version || '',
      vmVersion: findBugsSummary.vm_version || '',
      cpuSeconds: findBugsSummary.cpu_seconds ? Number(findBugsSummary.cpu_seconds) : null,
      clockSeconds: findBugsSummary.clock_seconds ? Number(findBugsSummary.clock_seconds) : null,
      peakMbytes: findBugsSummary.peak_mbytes ? Number(findBugsSummary.peak_mbytes) : null,
      allocMbytes: findBugsSummary.alloc_mbytes ? Number(findBugsSummary.alloc_mbytes) : null,
      gcSeconds: findBugsSummary.gc_seconds ? Number(findBugsSummary.gc_seconds) : null,
      priority1: findBugsSummary.priority_1 ? Number(findBugsSummary.priority_1) : 0,
      priority2: findBugsSummary.priority_2 ? Number(findBugsSummary.priority_2) : 0,
      priority3: findBugsSummary.priority_3 ? Number(findBugsSummary.priority_3) : 0,
    }

    // Thông tin thống kê tệp
    const fileStatList = findBugsSummary.FileStats ? (Array.isArray(findBugsSummary.FileStats) ? findBugsSummary.FileStats : [findBugsSummary.FileStats]) : []

    const fileStats = fileStatList.map((fs: any) => ({
      path: fs?.path || '',
      bugCount: fs?.bugCount ? Number(fs.bugCount) : 0,
      size: fs?.size ? Number(fs.size) : null,
      bugHash: fs?.bugHash || '',
    }))

    // Thông tin thống kê gói
    const packageStatList = findBugsSummary.PackageStats ? (Array.isArray(findBugsSummary.PackageStats) ? findBugsSummary.PackageStats : [findBugsSummary.PackageStats]) : []

    const packageStats = packageStatList.map((ps: any) => {
      const classStats = ps.ClassStats ? (Array.isArray(ps.ClassStats) ? ps.ClassStats : [ps.ClassStats]) : []

      const classStatsList = classStats.map((cs: any) => ({
        className: cs?.class || '',
        sourceFile: cs?.sourceFile || '',
        interface: cs?.interface || false,
        size: cs?.size ? Number(cs.size) : 0,
        bugs: cs?.bugs ? Number(cs.bugs) : 0,
        priority1: cs?.priority_1 ? Number(cs.priority_1) : 0,
        priority2: cs?.priority_2 ? Number(cs.priority_2) : 0,
        priority3: cs?.priority_3 ? Number(cs.priority_3) : 0,
      }))

      return {
        packageName: ps?.package || '',
        totalBugs: ps?.total_bugs ? Number(ps.total_bugs) : 0,
        totalTypes: ps?.total_types ? Number(ps.total_types) : 0,
        totalSize: ps?.total_size ? Number(ps.total_size) : 0,
        priority1: ps?.priority_1 ? Number(ps.priority_1) : 0,
        priority2: ps?.priority_2 ? Number(ps.priority_2) : 0,
        priority3: ps?.priority_3 ? Number(ps.priority_3) : 0,
        classStats: classStatsList,
      }
    })

    // Thông tin lỗi
    const errors = bugCollection.Errors || {}
    const errorInfo = {
      errors: errors.errors ? Number(errors.errors) : 0,
      missingClasses: errors.missingClasses ? Number(errors.missingClasses) : 0,
      missingClassList: errors.MissingClass ? (Array.isArray(errors.MissingClass) ? errors.MissingClass : [errors.MissingClass]) : [],
    }

    // Kết quả cuối cùng
    const result = {
      version,
      project: projectInfo,
      summary,
      fileStats,
      packageStats,
      errors: errorInfo,
      bugCategories,
      bugPatterns,
      bugCodes,
      bugInstances,
      bugCount: {
        total: summary.totalBugs,
        byPriority: {
          high: summary.priority1,
          medium: summary.priority2,
          low: summary.priority3,
        },
      },
    }

    l.info(`Analysis complete. Found ${result.bugCount.total} bugs.`)
    return result
  } catch (error) {
    l.error('Error parsing SpotBugs result:', error)
    return {
      version: { version: '', sequence: null, timestamp: null, analysisTimestamp: null, release: '' },
      project: { projectName: '', filename: '', jars: [], srcDirs: [] },
      summary: {
        timestamp: '',
        totalClasses: 0,
        referencedClasses: 0,
        totalBugs: 0,
        totalSize: 0,
        numPackages: 0,
        priority1: 0,
        priority2: 0,
        priority3: 0,
      },
      fileStats: [],
      packageStats: [],
      errors: { errors: 0, missingClasses: 0, missingClassList: [] },
      bugCategories: {},
      bugPatterns: {},
      bugCodes: {},
      bugInstances: [],
      bugCount: {
        total: 0,
        byPriority: {
          high: 0,
          medium: 0,
          low: 0,
        },
      },
    }
  }
}
