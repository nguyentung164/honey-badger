import type { PtyHostRequest, PtyHostResponse } from 'shared/terminal/ptyHostProtocol'
import { PtyService } from './ptyService'

const parentPort = process.parentPort

if (!parentPort) {
  throw new Error('PTY host must be started as an Electron utility process')
}

const service = new PtyService({
  onData: (id, data) => {
    parentPort.postMessage({ kind: 'data', id, data } satisfies PtyHostResponse)
  },
  onExit: (id, exitCode, signal) => {
    parentPort.postMessage({ kind: 'exit', id, exitCode, signal } satisfies PtyHostResponse)
  },
})

parentPort.on('message', event => {
  const request = event.data as PtyHostRequest
  const response = service.handle(request)
  if (response) {
    parentPort.postMessage(response)
  }
})

parentPort.postMessage({ kind: 'ready' } satisfies PtyHostResponse)
