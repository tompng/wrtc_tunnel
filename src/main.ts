import { createPeerConnection, createSDPOffer, createSDPAnswer, acceptSDPAnswer, waitPeerConnect } from './peer'
import { readLine } from './stdin'
import { ConnectionManager, Connection } from './connection'
console.log('started')

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

function sendrecv(channel: RTCDataChannel) {
  channel.onopen = () => console.log('datachannel open')
  channel.onclose = () => console.log('datachannel close')
  channel.onerror = () => console.log('datachannel error')
  channel.onmessage = e => {
    const data = e.data
    console.log('message: ' + data)
  }
  setInterval(() => {
    console.log('send ' + channel.bufferedAmount)
    channel.send(new TextEncoder().encode('hello' + Math.random()))
  }, 100)
}

async function startClient() {
  const peer = await createPeerConnection()
  const [channel, offerSDP] = await createSDPOffer(peer)
  showSDP(offerSDP)
  const answerSDP = await stdinReadSDP()
  acceptSDPAnswer(peer, answerSDP)
  await waitPeerConnect(peer)
  const manager = new ConnectionManager(channel, 'client')
  channel.onclose = channel.onerror = () => {
    console.log('connection closed')
    process.exit()
  }
  channel.onopen = () => {
    console.log('datachannel open')
    setInterval(() => {
      console.log('connecting')
      const conn = manager.connect()
      const timer = setInterval(() => conn.sendString('from client ' + Math.random()), 1000)
      conn.onclose = () => clearInterval(timer)
      conn.ondata = data => {
        console.log(conn.id + ': ' + new TextDecoder().decode(data))
      }
    }, 5000)
  }
}

async function startServer() {
  const offerSDP = await stdinReadSDP()
  const peer = await createPeerConnection()
  const answerSDP = await createSDPAnswer(peer, offerSDP)
  showSDP(answerSDP)
  await waitPeerConnect(peer)
  peer.ondatachannel = ({ channel }) => {
    console.log('ondatachannel: ' + channel.label)
    const manager = new ConnectionManager(channel, 'server')
    manager.onaccept = conn => {
      const timer = setInterval(() => conn.sendString('from server ' + Math.random()), 1000)
      conn.onclose = () => clearInterval(timer)
      conn.ondata = data => {
        console.log(conn.id + ': ' + new TextDecoder().decode(data))
      }
    }
  }
}

async function start() {
  const mode = process.argv[2]
  if (mode == 'client') {
    startClient()
  } else if (mode == 'server') {
    startServer()
  } else {
    console.log(`error: wrong mode ${mode}`)
  }
}

start()
