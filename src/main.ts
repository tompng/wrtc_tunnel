import { createPeerConnection, createSDPOffer, createSDPAnswer, acceptSDPAnswer, waitPeerConnect } from './peer'
import { readLine } from './stdin'
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
  channel.onbufferedamountlow = () => console.log('datachannel amount low')
  channel.onmessage = e => console.log('message: ' + e.data)
  setInterval(() => {
    channel.send('hello' + Math.random())
  }, 100)
}


async function start() {
  const mode = process.argv[2]
  if (mode == 'a') {
    const peer = await createPeerConnection()
    const [channel, sdp] = await createSDPOffer(peer, 'default')
    showSDP(sdp)
    const answerSDP = await stdinReadSDP()
    acceptSDPAnswer(peer, answerSDP)
    await waitPeerConnect(peer)
    channel.onopen = () => {
      console.log('datachannel open')
      sendrecv(channel)
    }
  } else if (mode == 'b') {
    const sdp = await stdinReadSDP()
    const peer = await createPeerConnection()
    const answerSDP = await createSDPAnswer(peer, sdp)
    showSDP(answerSDP)
    await waitPeerConnect(peer)
    peer.ondatachannel = ({ channel }) => {
      console.log('ondatachannel')
      sendrecv(channel)
    }
  } else {
    console.log(`error: wrong mode ${mode}`)
  }
}

start()
