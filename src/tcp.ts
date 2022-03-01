import * as net from 'net'
export class SocketEx {
  readerQueue: [resolve: (buf: Uint8Array) => void, reject: () => void][] = []
  readBuffer: number[] = []
  closed = false
  readSize = 16 * 1024
  pauseThreshold = 256 * 1024
  resumeThreshold = 16 * 1024
  writerRejects = new Set<() => void>()
  constructor(public socket: net.Socket) {
    socket.on('data', buf => {
      this.readBuffer.push(...buf)
      if (this.readBuffer.length >= this.pauseThreshold) socket.pause()
      const reader = this.readerQueue.shift()
      if (!reader) return
      const data = new Uint8Array(Math.min(this.readBuffer.length, this.readSize))
      for (let i = 0; i < data.length; i++) data[i] = this.readBuffer.shift()!
      reader[0](data)
      if (this.pauseThreshold < this.resumeThreshold) socket.resume()
    })
    socket.on('close', () => {
      if (this.closed) return
      this.readerQueue.forEach(q => q[1]())
      this.readerQueue.length = 0
      this.writerRejects.forEach(cb => cb())
      this.writerRejects.clear()
      this.closed = true
    })
  }

  async write(data: Uint8Array) {
    if (this.closed) throw 'closed'
    return new Promise<void>((resolve, reject) => {
      this.writerRejects.add(reject)
      this.socket.write(data, () => {
        resolve()
        this.writerRejects.delete(reject)
      })
    })
  }

  async read() {
    if (this.closed) throw 'closed'
    const { readerQueue } = this
    if (readerQueue.length === 0) {
      if (this.readBuffer.length > 0) {
        const buf = new Uint8Array(this.readBuffer)
        this.readBuffer.length = 0
        return buf
      }
    }
    return new Promise<Uint8Array>((resolve, reject) => {
      readerQueue.push([resolve, reject])
    })
  }

  close() {
    this.socket.destroy()
  }
}
