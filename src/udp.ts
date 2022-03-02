import * as dgram from 'dgram'
import { TimeoutCache } from './cache'

function packBuffer(id: number, data: Buffer) {
  const output = new Uint8Array(4 + data.byteLength)
  output[0] = (id >> 24) & 0xff
  output[1] = (id >> 16) & 0xff
  output[2] = (id >> 8) & 0xff
  output[3] = id & 0xff
  output.set(data, 4)
  return output
}

function unpackBuffer(data: Uint8Array) {
  const id = (data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3]
  return [id, data.slice(4)] as const
}

export function startUDPClient(channel: RTCDataChannel, port: number) {
  const addr2id = new TimeoutCache<string, number>(10 * 60 * 1000, true)
  const sockets = [
    dgram.createSocket('udp4').bind(port),
    dgram.createSocket('udp6').bind(port)
  ]
  sockets.forEach((socket, sid) => {
    socket.on('message', (data, { address, port }) => {
      const addr = [sid, address, port].join(' ')
      let id = addr2id.get(addr, true)
      if (!id) addr2id.set(addr, id = Math.floor(0x80000000 * Math.random()))
      channel.send(packBuffer(id, data))
    })
  })
  channel.onmessage = ({ data }) => {
    if (!(data instanceof ArrayBuffer)) return
    const [id, buffer] = unpackBuffer(new Uint8Array(data))
    const addr = addr2id.getKey(id, true)
    if (!addr) return
    const [sid, host, port] = addr.split(' ')
    sockets[Number(sid)].send(buffer, Number(port), host)
  }
}

export function serverHandleUDPChannel(channel: RTCDataChannel, socketType: dgram.SocketType, host: string, port: number) {
  const id2socket = new TimeoutCache<number, dgram.Socket>(10 * 60 * 1000)
  id2socket.ondelete = (_id, socket) => socket.close()
  function createSocket(id: number) {
    const socket = dgram.createSocket(socketType)
    socket.on('message', (data, rinfo) => {
      if (rinfo.port !== port) return
      channel.send(packBuffer(id, data))
    })
    return socket
  }
  channel.onmessage = ({ data }) => {
    if (!(data instanceof ArrayBuffer)) return
    const [id, buffer] = unpackBuffer(new Uint8Array(data))
    let socket = id2socket.get(id, true)
    if (!socket) id2socket.set(id, socket = createSocket(id))
    socket.send(buffer, port, host)
  }
  channel.onclose = channel.onerror = () => id2socket.terminate()
}
