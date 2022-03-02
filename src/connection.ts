const CMD_OPEN = 0
const CMD_CLOSE = 1
const CMD_DATA = 2
export class Connection {
  onclose?: () => void
  ondata?: (data: Uint8Array) => void
  readBuffer: Uint8Array[] = []
  readQueue: [resolve: (data: Uint8Array) => void, reject: () => void][] = []
  closed = false
  constructor(public manager: ConnectionManager, public id: number) {
    this.ondata = data => {
      const resolveReject = this.readQueue.shift()
      if (resolveReject) {
        resolveReject[0](data)
      } else {
        this.readBuffer.push(data)
      }
    }
  }
  async send(data: Uint8Array) {
    await this.manager.send(CMD_DATA, this.id, data)
  }
  async read() {
    const data = this.readBuffer.shift()
    if (data) return data
    return new Promise<Uint8Array>((resolve, reject) => this.readQueue.push([resolve, reject]))
  }
  async sendString(data: string) {
    await this.send(new TextEncoder().encode(data))
  }
  handleClose() {
    if (this.closed) return
    this.closed = true
    this.readQueue.forEach(r => r[1]())
    this.readQueue.length = this.readBuffer.length = 0
    this.onclose?.()
    this.manager.remove(this.id)
  }
  close() {
    if (this.closed) return
    this.manager.send(CMD_CLOSE, this.id)
    this.handleClose()
  }
}
export class ConnectionManager {
  serial = 0
  isServer: boolean
  connections = new Map<number, Connection>()
  onaccept?: (connection: Connection) => void
  bufferedAmountThreshold = 256 * 1024
  constructor(public channel: RTCDataChannel, mode: 'server' | 'client') {
    this.isServer = mode === 'server'
    this.start()
  }
  sendBuffer: [Uint8Array, () => void][] = []
  sendTimer: NodeJS.Timer | null = null
  sendRaw(data: Uint8Array, callback: () => void) {
    if (this.sendTimer) {
      this.sendBuffer.push([data, callback])
      return
    }
    if (this.channel.bufferedAmount < this.bufferedAmountThreshold) {
      this.channel.send(data)
      callback()
      return
    }
    this.sendBuffer.push([data, callback])
    this.startSendTimer()
  }
  startSendTimer() {
    if (this.sendTimer) return
    this.sendTimer = setInterval(() => {
      // channel.onbufferedamountlow is not implemented
      while (this.channel.bufferedAmount < this.bufferedAmountThreshold && this.sendBuffer.length > 0) {
        const [data, callback] = this.sendBuffer.shift()!
        this.channel.send(data)
        callback()
      }
      if (this.sendBuffer.length === 0) {
        if (this.sendTimer) clearTimeout(this.sendTimer)
        this.sendTimer = null
      }
    }, 5)
  }
  async send(type: 0 | 1 | 2, connectionID: number, data?: Uint8Array) {
    const message = new Uint8Array(4 + (data ? data.length : 0))
    message[0] = type
    message[1] = (connectionID >> 16) & 0xff
    message[2] = (connectionID >> 8) & 0xff
    message[3] = connectionID & 0xff
    if (data) message.set(data, 4)
    return new Promise<void>(resolve => this.sendRaw(message, resolve))
  }
  connect() {
    if (this.isServer) throw 'Server cannot connect'
    const connectionID = this.serial = (this.serial + 1) & 0xffffff
    this.send(CMD_OPEN, connectionID)
    const connection = new Connection(this, connectionID)
    this.connections.set(connectionID, connection)
    return connection
  }
  acceptConnection(connectionID: number) {
    if (this.connections.has(connectionID)) return
    const connection = new Connection(this, connectionID)
    this.connections.set(connectionID, connection)
    this.onaccept?.(connection)
  }
  remove(connectionID: number) {
    this.connections.delete(connectionID)
  }
  start() {
    this.channel.onclose = () => {
      this.connections.forEach(c => c.handleClose())
      this.connections.clear()
    }
    this.channel.onmessage = ({ data }) => {
      if (!(data instanceof ArrayBuffer)) return
      const message = new Uint8Array(data)
      const cmd = message[0]
      const connectionID = (message[1] << 16) | (message[2] << 8) | message[3]
      switch(cmd) {
        case CMD_OPEN:
          if (this.isServer) this.acceptConnection(connectionID)
          break
        case CMD_CLOSE:
          this.connections.get(connectionID)?.handleClose()
          this.connections.delete(connectionID)
          break
        case CMD_DATA:
          this.connections.get(connectionID)?.ondata?.(message.slice(4))
          break
      }
    }
  }
}
