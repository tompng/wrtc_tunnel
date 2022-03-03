import { createPeerConnection, createSDPOffer, createSDPAnswer, acceptSDPAnswer, waitPeerConnect } from './peer'
import { readLine } from './stdin'
import { ConnectionManager, Connection } from './connection'
import * as net from 'net'
import { SocketEx } from './tcp'
import { KVS } from './kvs'
import { startUDPClient, serverHandleUDPChannel } from './udp'
import type { WRTCDataChannel } from 'wrtc'

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
  while (true) {
    console.log(`Press ENTER to send connection request to server "${serverName}".`)
    console.log('Be sure to contact the server owner to manually fetch new connection request within 30 seconds.')
    await readLine('> ')
    await startClientConnect(serverName, port)
    await sleep(5000)
  }
}

async function startClientConnect(serverName: string, port: number) {
  console.log('preparing')
  const peer = await createPeerConnection()
  const [tcpChannel, udpChannel, offerSDP] = await createSDPOffer(peer)
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
  console.log(`${serverName}: connected`)
  const manager = new ConnectionManager(tcpChannel, 'client')
  let connCount = 0
  const tcpServer = net.createServer(async rawSocket => {
    let connId = connCount++
    const socket = new SocketEx(rawSocket)
    const connection = manager.connect()
    console.log(`${connId}:open`)
    await connect(connection, socket)
    console.log(`${connId}:close`)
  }).listen(port)
  const udpSockets = startUDPClient(udpChannel, port)
  return new Promise<void>(resolve => {
    peer.oniceconnectionstatechange = () => {
      if (peer.iceConnectionState === 'disconnected') {
        tcpChannel?.onclosemanually?.()
        udpChannel?.onclosemanually?.()
        console.log(`${serverName}: disconnected`)
        tcpServer.close()
        udpSockets.forEach(s => s.close())
        resolve()
      }
    }
  })
}

let peerCount = 0
async function serverAcceptConnection(offerSDP: string, host: string, port: number, callback: (answerSDP: string) => void) {
  const peer = await createPeerConnection()
  const answerSDP = await createSDPAnswer(peer, offerSDP)
  callback(answerSDP)
  await waitPeerConnect(peer)
  const peerName = `peer${peerCount++}`
  console.log(`${peerName} connected`)
  function handleTCPChannel(channel: WRTCDataChannel) {
    const manager = new ConnectionManager(channel, 'server')
    let connCount = 0
    manager.onaccept = connection => {
      const connId = connCount++
      console.log(`${peerName}:${connId} open`)
      const rawSocket = net.connect(port, host)
      rawSocket.on('connect', async () => {
        const socket = new SocketEx(net.connect(port, host))
        await connect(connection, socket)
        console.log(`${peerName}:${connId} close`)
      })
      rawSocket.on('error', () => {
        console.log('socket error')
        connection.close()
      })
    }
  }
  let tcpChannel: WRTCDataChannel
  let udpChannel: WRTCDataChannel
  peer.ondatachannel = ({ channel }) => {
    if (channel.label === 'tcp' && !tcpChannel) {
      handleTCPChannel(tcpChannel = channel)
    } else if (channel.label === 'udp' && !udpChannel) {
      const type = host.includes(':') ? 'udp6' : 'udp4'
      serverHandleUDPChannel(udpChannel = channel, type, host, port)
    }
  }
  peer.oniceconnectionstatechange = () => {
    if (peer.iceConnectionState === 'disconnected') {
      tcpChannel?.onclosemanually?.()
      udpChannel?.onclosemanually?.()
      console.log(`${peerName} disconnected`)
    }
  }
}

async function startServer(serverName: string, host: string, port: number) {
  console.log('Press ENTER to fetch new connection request.')
  const acceptedIds = new Set<string>()
  while (true) {
    await readLine()
    let offerId = ''
    let offerSDP = ''
    console.log('searching connection request')
    for (let i = 0; i < 10; i++) {
      const offerWithID = await KVS.read(serverName)
      console.log(offerWithID == null ? 'error' : '...')
      const id = offerWithID?.substring(0, 8)
      const sdp = offerWithID?.substring(8)
      if (id && sdp && !acceptedIds.has(id)) {
        offerId = id
        offerSDP = sdp
        break
      }
      await sleep(1000)
    }
    if (!offerId || !offerSDP) {
      console.log('no connection request found')
      continue
    }
    acceptedIds.add(offerId)
    serverAcceptConnection(offerSDP, host, port, answerSDP => {
      KVS.write(offerId, answerSDP)
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
  console.log(`Wrong mode "${mode}". should be "client" or "server"`)
  process.exit()
}
