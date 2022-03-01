import { createPeerConnection, createSDPOffer, createSDPAnswer, acceptSDPAnswer, waitPeerConnect } from './peer'
import { readLine } from './stdin'
import { ConnectionManager, Connection } from './connection'
import * as net from 'net'
import { SocketEx } from './tcp'
import { KVS } from './kvs'

function showSDP(sdp: string) {
  console.log('\n\n===SDP_START===\n' + sdp + '\n===SDP_END===\n\n')
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

const serverName = 'server1'

function randomID(n: number) {
  return [...new Array(n)].map(() => String.fromCharCode(Math.floor(97 + 26 * Math.random()))).join('')
}

async function sleep(time: number) {
  return new Promise(resolve => setTimeout(resolve, time))
}

async function startClient(serverName: string, port: number) {
  const peer = await createPeerConnection()
  const [channel, offerSDP] = await createSDPOffer(peer)
  const id = randomID(8)
  await KVS.write(serverName, id + offerSDP)
  let answerSDP: string | undefined
  for (let i = 0; i < 30; i++) {
    await sleep(1000)
    console.log('...')
    answerSDP = await KVS.read(id)
    if (answerSDP) break
  }
  if (!answerSDP) {
    console.log('timed out')
    return
  }
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

async function acceptConnection(offerSDP: string, host: string, port: number, callback: (answerSDP: string) => void) {
  const peer = await createPeerConnection()
  const answerSDP = await createSDPAnswer(peer, offerSDP)
  showSDP(answerSDP)
  callback(answerSDP)
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

async function startServer(serverName: string, host: string, port: number) {
  while (true) {
    console.log('waitingline')
    await readLine()
    const offerWithID = await KVS.read(serverName)
    if (!offerWithID) {
      console.log('no offer found')
      continue
    }
    const id = offerWithID.substring(0, 8)
    console.log('offer found', id)
    const offerSDP = offerWithID.substring(8)
    acceptConnection(offerSDP, host, port, answerSDP => {
      showSDP(answerSDP)
      KVS.write(id, answerSDP)
    })
  }
}

async function start() {
  const mode = process.argv[2]
  if (mode == 'client') {
    startClient(serverName, 3000)
  } else if (mode == 'server') {
    startServer(serverName, 'localhost', 8080)
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
