import { createPeerConnection, createSDPOffer, createSDPAnswer, acceptSDPAnswer, waitPeerConnect } from './peer'
import { readLine } from './stdin'
import { ConnectionManager, Connection } from './connection'
import * as net from 'net'
import { SocketEx } from './tcp'

function showSDP(sdp: string) {
  console.log('\n\n===SDP_START===\n' + sdp + '\n===SDP_END===\n\n')
}

async function stdinReadSDP() {
  const lines = []
  while(true) {
    const line = await readLine('> ')
    if (!line.match(/===SDP_(START|END)===/)) lines.push(line)
    if (line.match(/===SDP_END===/)) break
  }
  return lines.join('\n')
}

async function passC2S(connection: Connection, socket: SocketEx) {
  while (true) {
    const data = await connection.read()
    await socket.write(data)
  }
}
async function passS2C(socket: SocketEx, connection: Connection) {
  while (true) {
    const data = await socket.read()
    await connection.send(data)
  }
}

async function connect(connection: Connection, socket: SocketEx) {
  return new Promise<void>(resolve => {
    let closed = false
    const closeAll = () => {
      if (closed) return
      connection.close()
      socket.close()
      closed = true
      resolve()
    }
    passS2C(socket, connection).catch(closeAll)
    passC2S(connection, socket).catch(closeAll)
  })
}

async function startClient(port: number) {
  const peer = await createPeerConnection()
  const [channel, offerSDP] = await createSDPOffer(peer)
  showSDP(offerSDP)
  const answerSDP = await stdinReadSDP()
  acceptSDPAnswer(peer, answerSDP)
  await waitPeerConnect(peer)
  const manager = new ConnectionManager(channel, 'client')
  const server = net.createServer(async rawSocket => {
    const socket = new SocketEx(rawSocket)
    const connection = manager.connect()
    console.log('open')
    await connect(connection, socket)
    console.log('closed')
  })
  server.listen(port)
}

async function startServer(host: string, port: number) {
  const offerSDP = await stdinReadSDP()
  const peer = await createPeerConnection()
  const answerSDP = await createSDPAnswer(peer, offerSDP)
  showSDP(answerSDP)
  await waitPeerConnect(peer)
  peer.ondatachannel = ({ channel }) => {
    console.log('ondatachannel: ' + channel.label)
    const manager = new ConnectionManager(channel, 'server')
    manager.onaccept = connection => {
      console.log('accept')
      const rawSocket = net.connect(port, host)
      rawSocket.on('connect', async () => {
        const socket = new SocketEx(net.connect(port, host))
        await connect(connection, socket)
        console.log('closed')
      })
      rawSocket.on('error', () => {
        console.log('error')
        connection.close()
      })
    }
  }
}

async function start() {
  const mode = process.argv[2]
  if (mode == 'client') {
    startClient(3000)
  } else if (mode == 'server') {
    startServer('localhost', 8080)
  } else {
    console.log(`error: wrong mode ${mode}`)
  }
}

process.on('uncaughtException', e => {
  console.log('unhandled')
  console.log(e)
  console.log(e.stack)
})

start()
