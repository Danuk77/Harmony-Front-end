<script lang="ts">
  /**
   * The video call window should be
   *
   */

  import IconBubble from './components/IconBubble.svelte'
  import '@fortawesome/fontawesome-free/css/all.min.css'
  import '@fortawesome/fontawesome-free/js/all.min.js'
  import { store } from './redux'
  import { onMount } from 'svelte'
  import type { IceServer } from '../../common/redux'
  import { assertNever, eToStr } from '../../common/utils'

  let microphoneEnabled = $state(true)
  let cameraEnabled = $state(true)
  let audioOutputEnabled = $state(true)
  let failedToInitDevicesMessage: string | null = $state(null)

  let temporaryConnectionIssues = $state(false)

  type ConnectionState = {
    peerConnection: RTCPeerConnection
    // if peer adds an RTCDataChannel we can check for .close() on this channel to know when they are hanging up.
    dataChannel: RTCDataChannel | null
    callID: number
  }

  let conState: ConnectionState | null = null
  let remoteVideoElement: HTMLVideoElement
  let localStream: MediaStream | null = null

  const pk = new URLSearchParams(document.location.search).get('pk') ?? ''

  const iceServers: IceServer[] = [
    ...($store.user.stunServer ? [$store.user.stunServer] : []),
    ...($store.user.turnServer ? [$store.user.turnServer] : [])
  ]

  function peerHangsUp(cs: ConnectionState) {
    removeListeners(cs)
    window.api.peerHangsUpVideoCall(pk, cs.callID)
  }
  function videoConnectionError(cs: ConnectionState) {
    removeListeners(cs)
    window.api.errorVideoCall(pk, 'videoPlayer', 'Video connection error', cs.callID)
  }

  function closeVideoCall(cs: ConnectionState) {
    removeListeners(cs)
    cs.peerConnection.close()
  }

  function removeListeners(cs: ConnectionState) {
    console.log('listeners removed')
    cs.peerConnection.onicecandidate = null
    cs.peerConnection.onconnectionstatechange = null
    cs.peerConnection.oniceconnectionstatechange = null
    cs.peerConnection.onsignalingstatechange = null
    cs.peerConnection.ontrack = null
    cs.peerConnection.ondatachannel = null
    if (cs.dataChannel) cs.dataChannel.onclose = null
    temporaryConnectionIssues = false
  }

  function setupDataChannelListeners(cs: ConnectionState) {
    if (cs.dataChannel) {
      cs.dataChannel.onclose = () => {
        peerHangsUp(cs)
        if (conState?.callID == cs.callID) conState = null
      }
    }
  }

  function setupPeerConnectionListeners(cs: ConnectionState) {
    cs.peerConnection.ondatachannel = ({ channel }) => {
      cs.dataChannel = channel
      window.api.signallingCompleteVideoCall(pk, cs.callID)
      setupDataChannelListeners(cs)
    }

    cs.peerConnection.onicecandidate = ({ candidate }) => {
      console.log(candidate)
      if (candidate) {
        if (candidate.sdpMLineIndex === null) {
          return
        }
        // type nonsense - turn nulls into undefineds
        const _candidate = {
          candidate: candidate.candidate,
          sdpMLineIndex: candidate.sdpMLineIndex,
          ...(candidate.sdpMid ? { sdpMid: candidate.sdpMid } : {}),
          ...(candidate.usernameFragment ? { usernameFragment: candidate.usernameFragment } : {})
        }
        window.api.forwardICECandidateForVideoCall(pk, _candidate, cs.callID)
      }
    }
    cs.peerConnection.onconnectionstatechange = () => {
      console.log(cs.peerConnection.connectionState)
      switch (cs.peerConnection.connectionState) {
        case 'closed': {
          peerHangsUp(cs)
          if (conState?.callID == cs.callID) conState = null
          break
        }
        case 'failed': {
          videoConnectionError(cs)
          if (conState?.callID == cs.callID) conState = null
          break
        }
        case 'disconnected':
      }
    }
    cs.peerConnection.oniceconnectionstatechange = () => {
      let isDisconnected = false
      switch (cs.peerConnection.iceConnectionState) {
        case 'closed': {
          peerHangsUp(cs)
          if (conState?.callID == cs.callID) conState = null
          break
        }
        case 'failed': {
          videoConnectionError(cs)
          if (conState?.callID == cs.callID) conState = null
          break
        }
        case 'disconnected': {
          isDisconnected = true
          break
        }
      }

      temporaryConnectionIssues = isDisconnected
    }
    cs.peerConnection.onsignalingstatechange = () => {
      switch (cs.peerConnection.signalingState) {
        case 'closed':
          peerHangsUp(cs)
          if (conState?.callID == cs.callID) conState = null
          break
      }
    }
    cs.peerConnection.ontrack = ({ streams }) => {
      if (streams.length == 0) {
        window.api.errorVideoCall(pk, 'videoPlayer', 'Peer did not offer a video stream', cs.callID)
        closeVideoCall(cs)
        if (conState?.callID == cs.callID) conState = null
        return
      }
      remoteVideoElement.srcObject = streams[0]
      window.api.signallingCompleteVideoCall(pk, cs.callID)
    }
  }

  window.api.onMainToRenderer2WayAction(async ({ id, args }) => {
    console.log(id, args)
    switch (args.type) {
      case 'genSdpOfferForVideoCall': {
        if (args.payload.pk != pk) {
          return
        }
        if (!localStream) {
          window.api.mainToRenderer2WayActionResponse(id, {
            type: args.type,
            payload: {
              type: 'error',
              msg: 'Local stream not yet available'
            }
          })
          return
        }
        try {
          if (conState) {
            closeVideoCall(conState)
            conState = null
          }
          let pc = new RTCPeerConnection({ iceServers })
          let dc = pc.createDataChannel('closeCall')
          conState = {
            peerConnection: pc,
            callID: args.payload.callID,
            dataChannel: dc
          }
          setupPeerConnectionListeners(conState)
          setupDataChannelListeners(conState)
          for (const track of localStream.getTracks()) {
            conState.peerConnection.addTrack(track, localStream)
          }
          /**@todo, handle error if there is no local steam available.*/
          // create offer
          const offer = await conState.peerConnection.createOffer()
          if (offer.sdp && offer.type == 'offer') {
            await conState.peerConnection.setLocalDescription(offer)
            // return - callback
            window.api.mainToRenderer2WayActionResponse(id, {
              type: args.type,
              payload: {
                sdp: offer.sdp,
                type: 'offer'
              }
            })
          } else {
            window.api.mainToRenderer2WayActionResponse(id, {
              type: args.type,
              payload: {
                type: 'error',
                msg: 'Failed to generate SDP offer'
              }
            })
          }
        } catch (e) {
          window.api.mainToRenderer2WayActionResponse(id, {
            type: args.type,
            payload: {
              type: 'error',
              msg: eToStr(e)
            }
          })
        }

        break
      }
      case 'genSdpAnswerForVideoCall': {
        if (args.payload.pk != pk) {
          return
        }
        if (!localStream) {
          window.api.mainToRenderer2WayActionResponse(id, {
            type: args.type,
            payload: {
              type: 'error',
              msg: 'Local stream not yet available'
            }
          })
          return
        }
        try {
          if (conState) {
            closeVideoCall(conState)
            conState = null
          }
          conState = {
            peerConnection: new RTCPeerConnection({ iceServers }),
            callID: args.payload.callID,
            dataChannel: null
          }
          setupPeerConnectionListeners(conState)
          for (const track of localStream.getTracks()) {
            conState.peerConnection.addTrack(track, localStream)
          }
          // add offer and create answer
          await conState.peerConnection.setRemoteDescription(args.payload.offer)
          const answer = await conState.peerConnection.createAnswer()
          if (answer.sdp && answer.type == 'answer') {
            await conState.peerConnection.setLocalDescription(answer)
            window.api.mainToRenderer2WayActionResponse(id, {
              type: args.type,
              payload: {
                type: 'answer',
                sdp: answer.sdp
              }
            })
          } else {
            window.api.mainToRenderer2WayActionResponse(id, {
              type: args.type,
              payload: {
                type: 'error',
                msg: 'Failed to generate SDP answer'
              }
            })
          }
        } catch (e) {
          window.api.mainToRenderer2WayActionResponse(id, {
            type: args.type,
            payload: {
              type: 'error',
              msg: eToStr(e)
            }
          })
        }
        break
      }
      default:
        assertNever(args)
    }
  })

  window.api.onMainToRenderer1WayAction(async (action) => {
    switch (action.type) {
      case 'error':
      case 'failed-login':
      case 'receive-message': {
        // ignore
        break
      }
      case 'peerSdpAnswerForVideoCall': {
        if (action.payload.peerPk != pk) {
          return
        }
        if (!conState) {
          window.api.errorVideoCall(
            pk,
            'routine',
            'Renderer received an answer sdp, but no peer connection is being set up',
            action.payload.callID
          )
          return
        }
        if (!conState.peerConnection.pendingLocalDescription) {
          window.api.errorVideoCall(
            pk,
            'routine',
            'Renderer received an answer sdp, but does not have a local description',
            action.payload.callID
          )
          return
        }
        await conState.peerConnection.setRemoteDescription(action.payload.sdp)
        // should start creating and sending ICE candidates
        // ice candidate listener is already set up
        break
      }

      case 'peerIceCandidateForVideoCall': {
        if (action.payload.peerPk != pk) {
          return
        }
        if (!conState) {
          window.api.errorVideoCall(
            pk,
            'routine',
            'Renderer received an ICE candidate, but no peer connection is being set up',
            action.payload.callID
          )
          return
        }
        // if (
        //   !conState.peerConnection.pendingLocalDescription ||
        //   !conState.peerConnection.pendingRemoteDescription
        // ) {
        //   window.api.errorVideoCall(
        //     pk,
        //     'routine',
        //     'Renderer received an ICE candidate, but does not have a local and/or remote description',
        //     action.payload.callID
        //   )
        //   return
        // }
        conState.peerConnection.addIceCandidate(action.payload.candidate)
        break
      }
      default:
        assertNever(action)
    }
  })

  async function initDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices()

    console.log($store.user)

    // check that devices contains at least 1 audio and 1 video
    if (!devices.find((device) => device.kind == 'videoinput')) {
      throw new Error('No camera connected')
    }
    if (!devices.find((device) => device.kind == 'audioinput')) {
      throw new Error('No microphone connected')
    }

    // if user has specified devices, check if they exist
    if (
      $store.user.cameraId &&
      !devices.find((device) => device.deviceId == $store.user.cameraId)
    ) {
      console.log("User's selected camera not found")
    }
    if (
      $store.user.microphoneId &&
      !devices.find((device) => device.deviceId == $store.user.microphoneId)
    ) {
      console.log("User's selected microphone not found")
    }

    localStream = await navigator.mediaDevices.getUserMedia({
      video: {
        ...($store.user.cameraId ? { deviceId: { ideal: $store.user.cameraId } } : {})
      },
      audio: {
        // apparently you shouldn't change this (??) but it sounds like complete garbage otherwise
        // browser compatibility might be bad but this is always going to be running on the same browser - electron
        // https://stackoverflow.com/questions/49477768/poor-audio-quality-with-getusermedia-any-ideas-why
        sampleRate: { ideal: 44100 },
        ...($store.user.microphoneId ? { deviceId: { ideal: $store.user.microphoneId } } : {})
      }
    })
  }

  onMount(async () => {
    try {
      await initDevices()
    } catch (e) {
      failedToInitDevicesMessage = `${(e as Error).name}: ${(e as Error).message}`
    }

    document.title =
      $store.friendStates.find((f) => f.friend.peerPk == pk)?.friend.nickname ?? 'Video Call'

    // let main process know that this window is ready
    window.api.videoCallWindowOpens(pk)
  })

  window.onbeforeunload = () => {
    hangUp()
  }

  function hangUp() {
    if (!conState) {
      window.close()
      return
    }

    removeListeners(conState)
    conState.peerConnection.close()
    conState = null
    window.api.hangUpAndCloseVideoCall(pk)

    /**@todo stop tracks?*/
  }

  function microphone() {
    microphoneEnabled = !microphoneEnabled
  }

  function video() {
    cameraEnabled = !cameraEnabled
  }

  function audioOutput() {
    audioOutputEnabled = !audioOutputEnabled
  }

  let stateText = $derived.by(() => {
    const state = $store.friendStates.find((f) => f.friend.peerPk == pk)?.videoCallStatus
    if (!state) return null
    if (failedToInitDevicesMessage) {
      return failedToInitDevicesMessage
    }
    if (temporaryConnectionIssues) {
      return 'Connection issues...'
    }
    if (state.window == 'opening') {
      return 'Waiting for window...'
    }
    if (state.call == 'ringing') {
      if (state.callDirection == 'incoming') {
        return 'Incoming call'
      }
      if (state.callDirection == 'outgoing') {
        return 'Ringing...'
      }
    }
    if (state.call == 'failed') {
      if (state.errorMsg) {
        return 'Call failed: ' + state.errorMsg
      } else {
        return 'Call failed'
      }
    }
    if (state.call == 'peer-hang-up') {
      return 'Peer has hung up'
    }
    if (state.call == 'signalling') {
      return 'Connecting...'
    }
    return null
  })
</script>

<div id="callWindow">
  <div id="videoContainer">
    <video id="remoteVideo" bind:this={remoteVideoElement} autoplay></video>
  </div>
  <div id="stateContainer">
    {#if !!stateText}
      <p id="state">
        {stateText}
      </p>
    {/if}
  </div>
  <div id="iconBand">
    <div id="iconPanel">
      <IconBubble
        ariaLabel="Enable/disable microphone"
        icon={'fa-microphone'}
        --background-color="var(--color-button-normal)"
        onclick={microphone}
        strikethrough={!microphoneEnabled}
      />
      <IconBubble
        ariaLabel="Enable/disable video"
        icon="fa-video"
        --background-color="var(--color-button-normal)"
        onclick={video}
        strikethrough={!cameraEnabled}
      />
      <IconBubble
        ariaLabel="Mute/unmute"
        icon="fa-headphones"
        --background-color="var(--color-button-normal)"
        onclick={audioOutput}
        strikethrough={!audioOutputEnabled}
      />
      <IconBubble
        ariaLabel="Hang up"
        icon="fa-phone"
        --icon-rotation="135deg"
        --background-color="var(--color-button-hangup)"
        onclick={hangUp}
      />
    </div>
  </div>
</div>

<style>
  #stateContainer {
    position: absolute;
    margin-top: 15px;
    top: 30;
    width: 100%;
    display: flex;
    flex-direction: row;
    justify-content: center;
  }

  #state {
    background-color: var(--color-video-caller-status-bubble);
    border-radius: 18px;
    padding: 4px;
    padding-left: 8px;
    padding-right: 8px;
    box-shadow: var(--darks-box-shadow);
  }

  #videoContainer {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: grid;
    place-items: center;
  }

  #remoteVideo {
    position: absolute;
    height: 100%;
    width: 100%;
  }

  #callWindow {
    background-color: var(--ev-c-purple-2);
    position: absolute;
    left: 0px;
    top: 0px;
    right: 0px;
    bottom: 0px;
  }

  #iconPanel {
    display: flex;
    justify-content: center;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 20px;
  }

  #iconBand {
    width: 100%;
    display: flex;
    justify-content: center;
    position: absolute;
    bottom: 20px;
  }
</style>
