import { RTCPeerConnection, RTCSessionDescription, WRTCDataChannel } from 'wrtc'

export async function createPeerConnection() {
  const peer = new RTCPeerConnection({ iceServers: [] })
  peer.onicecandidateerror = e => console.log('icecandidate error', e)
  return peer
}

export async function createSDPOffer(peer: RTCPeerConnection): Promise<[WRTCDataChannel, WRTCDataChannel, string]> {
  const tcpChannel = peer.createDataChannel('tcp')
  const udpChannel = peer.createDataChannel('udp', { ordered: false, maxRetransmits: 0 })
  const offerDescription = await peer.createOffer()
  await peer.setLocalDescription(offerDescription)
  const localDescription = await waitPeerICEGather(peer)
  return [tcpChannel, udpChannel, localDescription.sdp]
}

export async function acceptSDPAnswer(peer: RTCPeerConnection, sdp: string) {
  const answerDescription = new RTCSessionDescription({ type : 'answer', sdp })
  peer.setRemoteDescription(answerDescription)
}

export async function createSDPAnswer(peer: RTCPeerConnection, sdp: string) {
  const offerDescription = new RTCSessionDescription({ type : 'offer', sdp })
  await peer.setRemoteDescription(offerDescription)
  const answerDescription = await peer.createAnswer()
  peer.setLocalDescription(answerDescription)
  const localDescription = await waitPeerICEGather(peer)
  return localDescription.sdp
}

async function waitPeerICEGather(peer: RTCPeerConnection) {
  return new Promise<RTCSessionDescription>((resolve) => {
    peer.onicegatheringstatechange = () => {
      if (peer.iceGatheringState !== 'complete') return
      peer.onicegatheringstatechange = null
      resolve(peer.localDescription!)
    }
  })
}

export async function waitPeerConnect(peer: RTCPeerConnection) {
  return new Promise<void>((resolve, reject) => {
    const test = () => {
      switch (peer.connectionState) {
        case 'connected':
          resolve()
          return true
        case 'closed':
        case 'disconnected':
        case 'failed':
          reject()
          return true
        default:
          return false
      }
    }
    if (test()) return
    peer.onconnectionstatechange = () => {
      if (test()) peer.onconnectionstatechange = null
    }
  })
}
