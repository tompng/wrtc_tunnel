declare module 'wrtc' {
  export const RTCPeerConnection = globalThis.RTCPeerConnection
  export const RTCSessionDescription = globalThis.RTCSessionDescription
  type DataChannelUnImplemented = 'onclose' | 'onerror' | 'onbufferedamountlow'
  export type WRTCDataChannel = Omit<RTCDataChannel, DataChannelUnImplemented> & {
    onclosemanually?: () => void
  }
}
