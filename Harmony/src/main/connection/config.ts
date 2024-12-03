export const rtcConfig: RTCConfiguration = {
  iceServers: [
    {
      urls: [
        // STUN servers
        'stun:stun1.1.google.com:19302',
        'stun:stun2.1.google.com:19302',
        'stun:stun.ekiga.net:3478'
      ]
    }
  ]
}

export const backendURL = 'ws://localhost:8080/ws'
