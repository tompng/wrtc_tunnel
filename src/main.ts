import { createPeerConnection, createSDPOffer, createSDPAnswer, acceptSDPAnswer, waitPeerConnect } from './peer'
import { readLine } from './stdin'
import { ConnectionManager, Connection } from './connection'
import * as net from 'net'
import { SocketEx } from './tcp'
import { KVS } from './kvs'

KVS.baseURL = 'https://limitless-headland-26408.herokuapp.com'

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
  let answerSDP: string | null = null
  for (let i = 0; i < 30; i++) {
    await sleep(1000)
    answerSDP = await KVS.read(id)
    console.log(answerSDP == null ? 'error' : '...')
    if (answerSDP) break
  }
  if (!answerSDP) {
    console.log('timed out')
    return
  }
  acceptSDPAnswer(peer, answerSDP)
  await waitPeerConnect(peer)
  console.log('connected')
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
  callback(answerSDP)
  await waitPeerConnect(peer)
  console.log('connected')
  peer.ondatachannel = ({ channel }) => {
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
  console.log('Press ENTER to accept new connection.')
  while (true) {
    await readLine()
    let offerWithID: string | null = null
    console.log('searching connection request')
    for (let i = 0; i < 10; i++) {
      offerWithID = await KVS.read(serverName)
      console.log(offerWithID == null ? 'error' : '...')
      if (offerWithID) break
      await sleep(1000)
    }
    if (!offerWithID) {
      console.log('no connection request found')
      continue
    }
    const id = offerWithID.substring(0, 8)
    const offerSDP = offerWithID.substring(8)
    acceptConnection(offerSDP, host, port, answerSDP => {
      KVS.write(id, answerSDP)
    })
  }
}

process.on('uncaughtException', e => {
  console.log(e)
  console.log(e.stack)
})

function exitWithMessage(...messages: string[]) {
  console.log(messages.join('\n'))
  process.exit()
}

const baseClientCommand = 'npm run client ServerName LocalPort'
const baseServerCommand = 'npm run server ServerName Host Port'
const mode = process.argv[2]
if (mode == 'client') {
  const serverName = process.argv[3]
  const localPort = parseInt(process.argv[4])
  if (!serverName) exitWithMessage('ServerName missing', baseClientCommand)
  if (!localPort) exitWithMessage('Wrong LocalPort', baseClientCommand)
  startClient(serverName, localPort)
} else if (mode == 'server') {
  const serverName = process.argv[3]
  const host = process.argv[4]
  const port = parseInt(process.argv[5])
  if (!serverName) exitWithMessage('ServerName missing', baseServerCommand)
  if (!host) exitWithMessage('Wrong Host', baseServerCommand)
  if (!port) exitWithMessage('Wrong Port', baseServerCommand)
  startServer(serverName, host, port)
} else {
  console.log(`error: wrong mode ${mode}`)
}
