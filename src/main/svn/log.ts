import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import l from 'electron-log'
import configurationStore from '../store/ConfigurationStore'
import { getWorkingCopyRoot } from './info'

const execPromise = promisify(exec)

interface SVNResponse {
  status: 'success' | 'error' | 'no-change'
  message?: string
  data?: any
  totalEntries?: number
  suggestedStartDate?: string
  sourceFolderPrefix?: string
  workingCopyRootFolder?: string
}
export interface LogOptions {
  dateFrom?: string
  dateTo?: string
  revisionFrom?: string
  revisionTo?: string
  /** Working directory for svn commands. If not set, uses configurationStore.sourceFolder */
  cwd?: string
}

async function fetchAllLogData(
  filePath: string,
  startDate: string | undefined,
  endDate: string | undefined,
  revisionFrom?: string,
  revisionTo?: string,
  cwd?: string
): Promise<{
  status: 'success' | 'error'
  totalEntries?: number
  data?: string
  message?: string
  sourceFolderPrefix?: string
  workingCopyRootFolder?: string
}> {
  let baseCommand = `svn log "${filePath}"`
  let detailCommandBase = `svn log -v "${filePath}"`
  const { sourceFolder } = configurationStore.store
  const workingDir = cwd || sourceFolder

  // Priority: revision range > date range
  if (revisionFrom && revisionTo) {
    const revisionArg = ` -r ${revisionFrom}:${revisionTo}`
    baseCommand += revisionArg
    detailCommandBase += revisionArg
  } else if (revisionFrom) {
    const revisionArg = ` -r ${revisionFrom}:HEAD`
    baseCommand += revisionArg
    detailCommandBase += revisionArg
  } else if (startDate) {
    const fromISO = startDate ? new Date(startDate).toISOString() : null
    const toISO = endDate ? new Date(endDate).toISOString() : null

    if (fromISO) {
      const revisionRange = toISO ? `{${fromISO}}:{${toISO}}` : `{${fromISO}}:HEAD`
      const revisionArg = ` --revision "${revisionRange}"`
      baseCommand += revisionArg
      detailCommandBase += revisionArg
    }
  }

  const revisionListCommand = `${baseCommand} -q`
  const rangeDesc = revisionFrom ? `r${revisionFrom}:${revisionTo || 'HEAD'}` : `${startDate || 'Beginning'} - ${endDate || 'HEAD'}`
  l.info(`Executing revision list command (Range: ${rangeDesc}):`, revisionListCommand)

  l.info(revisionListCommand)
  let allRevisions: string[] = []
  try {
    const { stdout: revisionStdout, stderr: revisionStderr } = await execPromise(revisionListCommand, { cwd: workingDir, maxBuffer: 1024 * 1024 * 20 })
    if (revisionStderr && !revisionStdout.trim()) {
      l.warn(`Warning fetching revision list: ${revisionStderr}`)
      return { status: 'error', message: `Error fetching revision list: ${revisionStderr}` }
    }
    if (revisionStderr) {
      l.warn(`Non-fatal warning fetching revision list: ${revisionStderr}`)
    }

    const parsedRevisions = revisionStdout
      .split('------------------------------------------------------------------------')
      .map(entry => entry.trim())
      .filter(entry => entry)
      .map(entry => entry.match(/^r(\d+)\s+\|/)?.[1])
      .filter((rev): rev is string => !!rev)

    allRevisions = [...new Set(parsedRevisions)]
    if (parsedRevisions.length !== allRevisions.length) {
      l.warn(`Removed ${parsedRevisions.length - allRevisions.length} duplicate revision IDs.`)
    }
    l.info(`Found ${allRevisions.length} unique revisions matching criteria in range.`)
  } catch (fetchError) {
    l.error('Error executing revision list command:', fetchError)
    if (fetchError instanceof Error && fetchError.message.includes('non-existent')) {
      allRevisions = []
      l.info('Path might not exist or has no history in the specified range.')
    } else {
      return { status: 'error', message: `Error fetching revision list: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}` }
    }
  }
  const totalEntries = allRevisions.length
  if (totalEntries === 0) {
    const rangeDesc2 = revisionFrom ? `r${revisionFrom}:${revisionTo || 'HEAD'}` : `${startDate || 'Beginning'}, ${endDate || 'HEAD'}`
    l.info(`No revisions found in range [${rangeDesc2}].`)
    return { status: 'success', totalEntries: 0, data: '' }
  }
  const detailCommand = detailCommandBase
  l.info('Executing detail command for ALL revisions in range:', detailCommand)

  let allData = ''
  try {
    const { stdout: detailStdout, stderr: detailStderr } = await execPromise(detailCommand, { cwd: workingDir, maxBuffer: 1024 * 1024 * 100 })
    if (detailStderr && !detailStdout.trim()) {
      l.warn(`Warning fetching log details: ${detailStderr}`)
    }
    if (detailStderr) {
      l.warn(`Non-fatal warning fetching log details: ${detailStderr}`)
    }
    allData = detailStdout.trim()
    l.info(`Fetched detailed log data for ${totalEntries} revisions, data length: ${allData.length}`)
  } catch (detailError) {
    l.error('Error executing detail command:', detailError)
    return { status: 'error', message: `Error fetching log details: ${detailError instanceof Error ? detailError.message : String(detailError)}` }
  }
  return { status: 'success', totalEntries: totalEntries, data: allData }
}

export async function log(filePath: string | string[] = '.', options?: LogOptions): Promise<SVNResponse> {
  try {
    l.info('Initial Log options (fetching all data):', options)
    const { dateFrom, dateTo, revisionFrom, revisionTo, cwd } = options || {}
    const { sourceFolder } = configurationStore.store
    const workingDir = cwd || sourceFolder
    let suggestedStartDate: string | undefined

    let sourceFolderPrefix = ''
    let workingCopyRootFolder = ''
    const rootFolder = await getWorkingCopyRoot(workingDir)
    if (rootFolder && workingDir) {
      workingCopyRootFolder = rootFolder.replace(/\\/g, '/').replace(/\/$/, '')
      const normalizedSource = workingDir.replace(/\\/g, '/').replace(/\/$/, '')
      if (normalizedSource.length > workingCopyRootFolder.length && normalizedSource.startsWith(workingCopyRootFolder)) {
        sourceFolderPrefix = normalizedSource.substring(workingCopyRootFolder.length)
        if (sourceFolderPrefix.startsWith('/')) {
          sourceFolderPrefix = sourceFolderPrefix.substring(1)
        }
      }
    }

    if (Array.isArray(filePath)) {
      l.info(`Multiple files provided (${filePath.length}), fetching logs for each file separately`)
      let combinedData = ''
      let totalEntries = 0
      let hasError = false
      let errorMessage = ''
      for (const path of filePath) {
        l.info(`Fetching log for file: ${path}`)
        const singleResult = await fetchAllLogData(path, dateFrom, dateTo, revisionFrom, revisionTo, workingDir)
        if (singleResult.status === 'error') {
          hasError = true
          errorMessage += `Error fetching log for ${path}: ${singleResult.message}\n`
          continue
        }
        if (singleResult.data) {
          if (combinedData) {
            combinedData += '\n------------------------------------------------------------------------\n'
          }
          combinedData += singleResult.data
          totalEntries += singleResult.totalEntries || 0
        }
      }

      if (hasError && !combinedData) {
        return { status: 'error', message: errorMessage.trim() }
      }

      return {
        status: 'success',
        data: combinedData,
        totalEntries,
        sourceFolderPrefix,
        workingCopyRootFolder,
        message: hasError ? errorMessage.trim() : undefined,
      }
    }

    const rangeDesc = revisionFrom ? `r${revisionFrom}:${revisionTo || 'HEAD'}` : `[${dateFrom || 'Beginning'}, ${dateTo || 'HEAD'}]`
    l.info(`--- Attempt 1: Fetching ALL logs for ${rangeDesc} ---`)
    let result = await fetchAllLogData(filePath, dateFrom, dateTo, revisionFrom, revisionTo, workingDir)

    if (result.status === 'error') {
      return { status: 'error', message: result.message }
    }

    let totalEntries = result.totalEntries ?? 0
    let allData = result.data ?? ''

    if (totalEntries === 0 && dateFrom) {
      l.info(`No revisions found in the initial range [${dateFrom}, ${dateTo || 'HEAD'}].`)
      l.info(`Searching for the last revision of "${filePath}" at or before ${dateFrom}...`)
      try {
        const fromISO = new Date(dateFrom).toISOString()
        const findLastRevisionCommand = `svn log "${filePath}" -r 1:{"${fromISO}"} -l 1 --xml`
        l.info('Executing command to find last revision before start date:', findLastRevisionCommand)

        const { stdout: lastRevisionStdout, stderr: lastRevisionStderr } = await execPromise(findLastRevisionCommand, { cwd: workingDir, maxBuffer: 1024 * 1024 })

        if (lastRevisionStderr && !lastRevisionStdout) {
          l.warn(`Warning finding last revision before start date: ${lastRevisionStderr}`)
        }

        if (lastRevisionStdout) {
          const dateMatch = lastRevisionStdout.match(/<date>(.*?)<\/date>/)
          if (dateMatch?.[1]) {
            suggestedStartDate = dateMatch[1]
            l.info(`Found last revision date before ${dateFrom}: ${suggestedStartDate}. Retrying fetch.`)
            l.info(`--- Attempt 2: Retrying fetch ALL logs for [${suggestedStartDate}, ${dateTo || 'HEAD'}] ---`)
            if (Array.isArray(filePath)) {
              let combinedData = ''
              let totalEntries = 0
              let hasError = false
              let errorMessage = ''
              for (const path of filePath) {
                l.info(`Retrying fetch log for file: ${path}`)
                const singleResult = await fetchAllLogData(path, suggestedStartDate, dateTo, revisionFrom, revisionTo, workingDir)
                if (singleResult.status === 'error') {
                  hasError = true
                  errorMessage += `Error fetching log for ${path}: ${singleResult.message}\n`
                  continue
                }
                if (singleResult.data) {
                  if (combinedData) {
                    combinedData += '\n------------------------------------------------------------------------\n'
                  }
                  combinedData += singleResult.data
                  totalEntries += singleResult.totalEntries || 0
                }
              }

              if (hasError && !combinedData) {
                return { status: 'error', message: errorMessage.trim(), suggestedStartDate }
              }

              return {
                status: 'success',
                data: combinedData,
                totalEntries,
                suggestedStartDate,
                sourceFolderPrefix,
                workingCopyRootFolder,
                message: hasError ? errorMessage.trim() : undefined,
              }
            }

            result = await fetchAllLogData(filePath, suggestedStartDate, dateTo, revisionFrom, revisionTo, workingDir) // Gọi lại fetchAllLogData

            if (result.status === 'error') {
              return { status: 'error', message: result.message, suggestedStartDate }
            }
            totalEntries = result.totalEntries ?? 0
            allData = result.data ?? ''
            return {
              status: 'success',
              data: allData,
              totalEntries,
              suggestedStartDate,
              sourceFolderPrefix,
              workingCopyRootFolder,
            }
          }
          l.info('Could not parse date from the last revision XML output. No retry possible.')
        } else {
          l.info('No output received when searching for the last revision before start date. No retry possible.')
        }
      } catch (findLastError) {
        l.warn(
          `Could not find any revision for "${filePath}" at or before ${dateFrom}. No retry possible. Error: ${findLastError instanceof Error ? findLastError.message : String(findLastError)}`
        )
      }
      return {
        status: 'success',
        data: '',
        totalEntries: 0,
        suggestedStartDate,
        sourceFolderPrefix,
        workingCopyRootFolder,
      }
    }

    l.info('Returning result (all data fetched).')
    return {
      status: 'success',
      data: allData,
      totalEntries,
      suggestedStartDate,
      sourceFolderPrefix,
      workingCopyRootFolder,
    } // suggestedStartDate is likely null here
  } catch (error) {
    l.error('Unexpected error in log function:', error)
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}
