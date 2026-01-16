type FsCallback = (err: Error | null, data?: Uint8Array | string | ArrayBuffer) => void

type ReadFileOptions = {
  encoding?: string | null
}

function parseArgs(path: string, options: ReadFileOptions | FsCallback | undefined, callback?: FsCallback) {
  if (typeof options === 'function') {
    return { encoding: null, callback: options }
  }
  return {
    encoding: options && typeof options === 'object' ? options.encoding : null,
    callback: callback as FsCallback | undefined,
  }
}

export function readFile(path: string, options?: ReadFileOptions | FsCallback, callback?: FsCallback) {
  const parsed = parseArgs(path, options, callback)
  const cb = parsed.callback
  if (typeof cb !== 'function') {
    throw new Error('fs.readFile callback is required in browser shim')
  }

  fetch(path)
    .then((res) => {
      if (!res.ok) {
        throw new Error(`Failed to fetch ${path}: ${res.status}`)
      }
      if (parsed.encoding === 'utf8' || parsed.encoding === 'utf-8') {
        return res.text().then((text) => ({ text, buffer: null as null }))
      }
      return res.arrayBuffer().then((buffer) => ({ buffer, text: null as null }))
    })
    .then(({ text, buffer }) => {
      if (text !== null) {
        cb(null, text as string)
        return
      }
      if (buffer !== null) {
        const payload = new Uint8Array(buffer)
        cb(null, payload)
        return
      }
      cb(new Error('Unsupported response type from fetch'))
    })
    .catch((err) => cb(err))
}
