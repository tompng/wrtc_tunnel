import { RTCPeerConnection, RTCSessionDescription } from 'wrtc'
import { readLine } from './stdin'
console.log('started')

// https://html5experts.jp/mganeko/19814/

async function createPeerConnection() {
  const peer = new RTCPeerConnection({ iceServers: [] })
  peer.onicecandidateerror = e => console.log('error', e)
  peer.ontrack = e => console.log('track', e)
  peer.onicecandidate = e => console.log('icecandidate ' + !e.candidate)
  let resolve: (peer: RTCSessionDescription) => void
  const promise = new Promise<RTCSessionDescription>(r => { resolve = r })
  peer.oniceconnectionstatechange = () => console.log('iceconnectionstate = ' + peer.iceConnectionState)
  peer.onsignalingstatechange = () => console.log('signalingstate = ' + peer.signalingState)
  peer.onicegatheringstatechange = () => {
    console.log('icegatheringstate = ' + peer.iceGatheringState)
    if (peer.iceGatheringState == 'complete') resolve(peer.localDescription!)
  }
  peer.onconnectionstatechange = () => console.log('connectionstate = ' + peer.connectionState)
  peer.ondatachannel = () => console.log('datachannel')
  peer.onicecandidateerror = e => console.log('icecandidate error', e)
  peer.onnegotiationneeded = () => console.log('negotiationneeded')
  return [peer, promise] as const
}
function showSDP(sdp: string) {
  console.log('\n\n===SDP_START===\n' + sdp + '\n===SDP_END===\n\n')
}

async function createOffer() {
  const [peer, waitICE] = await createPeerConnection()
  const dataChannel = peer.createDataChannel('myLabel');
  const offerDescription = await peer.createOffer()
  await peer.setLocalDescription(offerDescription)
  const localDescription = await waitICE
  showSDP(localDescription.sdp)
  const sdp = await stdinReadSDP()
  const answerDescription = new RTCSessionDescription({ type : 'answer', sdp })
  peer.setRemoteDescription(answerDescription)
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

async function acceptOffer(sdp: string) {
  const offerDescription = new RTCSessionDescription({ type : 'offer', sdp })
  const [peer, waitICE] = await createPeerConnection()
  await peer.setRemoteDescription(offerDescription)
  const answerDescription = await peer.createAnswer()
  peer.setLocalDescription(answerDescription)
  const localDescription = await waitICE
  showSDP(localDescription.sdp)
}

async function start() {
  const mode = process.argv[2]
  if (mode == 'a') {
    createOffer()
  } else if (mode == 'b') {
    const sdp = await stdinReadSDP()
    acceptOffer(sdp)
  } else {
    console.log(`error: wrong mode ${mode}`)
  }
}

start()
