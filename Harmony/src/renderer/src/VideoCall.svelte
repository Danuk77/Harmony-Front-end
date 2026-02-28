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
  import { eToStr } from '../../common/utils'

  let microphoneEnabled = $state(true)
  let cameraEnabled = $state(true)
  let audioOutputEnabled = $state(true)

  // let remoteStream = $state<MediaStream>()
  // let localStream = $state<MediaStream>()
  let peerConnection = $state<RTCPeerConnection>()
  let remoteVideoElement: HTMLVideoElement

  const pk = new URLSearchParams(document.location.search).get('pk') ?? ''

  onMount(async () => {
    // const pk = new URLSearchParams(document.location.search).get('pk') ?? ''
    if (pk == '') {
      throw new Error('no public key provided')
    }

    const localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: {
        // apparently you shouldn't change this (??) but it sounds like complete garbage otherwise
        // browser compatibility might be bad but this is always going to be running on the same browser - electron
        // https://stackoverflow.com/questions/49477768/poor-audio-quality-with-getusermedia-any-ideas-why
        sampleRate: 44100
      }
    })

    // let peerConnection: RTCPeerConnection | undefined = undefined

    const iceServers: IceServer[] = [
      ...($store.user.stunServer ? [$store.user.stunServer] : []),
      ...($store.user.turnServer ? [$store.user.turnServer] : [])
    ]

    function closeCall(pc: RTCPeerConnection) {
      pc.onicecandidate = null
      pc.onconnectionstatechange = null
      pc.oniceconnectionstatechange = null
      pc.onsignalingstatechange = null
      pc.ontrack = null

      /**@todo stop tracks?*/

      pc.close()
    }

    function setupPeerConnectionListeners(pc: RTCPeerConnection) {
      pc.onicecandidate = ({ candidate }) => {
        /**@todo send ice candidate to peer*/
        if (candidate) {
          if (!candidate.sdpMLineIndex) {
            return
          }
          // type nonsense - turn nulls into undefineds
          const _candidate = {
            candidate: candidate.candidate,
            sdpMLineIndex: candidate.sdpMLineIndex,
            ...(candidate.sdpMid ? { sdpMid: candidate.sdpMid } : {}),
            ...(candidate.usernameFragment ? { usernameFragment: candidate.usernameFragment } : {})
          }
          window.api.forwardICECandidateForVideoCall(pk, _candidate)
        }
      }
      pc.onconnectionstatechange = () => {
        switch (pc.connectionState) {
          case 'closed':
          case 'disconnected':
          case 'failed':
            closeCall(pc)
        }
      }
      pc.oniceconnectionstatechange = () => {
        switch (pc.iceConnectionState) {
          case 'closed':
          case 'disconnected':
          case 'failed':
            closeCall(pc)
        }
      }
      pc.onsignalingstatechange = () => {
        switch (pc.signalingState) {
          case 'closed':
            closeCall(pc)
        }
      }
      pc.ontrack = ({ streams }) => {
        remoteVideoElement.srcObject = streams[0]
      }
    }

    window.api.onMainToRenderer2WayAction(async ({ id, args }) => {
      switch (args.type) {
        case 'genSdpOfferForVideoCall': {
          if (args.payload.pk == pk) {
            try {
              if (peerConnection) {
                peerConnection.close()
              }
              peerConnection = new RTCPeerConnection({ iceServers })
              setupPeerConnectionListeners(peerConnection)
              for (const track of localStream.getTracks()) {
                peerConnection.addTrack(track)
              }
              // create offer
              const offer = await peerConnection.createOffer()
              if (offer.sdp && offer.type == 'offer') {
                await peerConnection.setLocalDescription(offer)
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
          }
          break
        }
        case 'genSdpAnswerForVideoCall': {
          if (args.payload.pk == pk) {
            try {
              if (peerConnection) {
                peerConnection.close()
              }
              peerConnection = new RTCPeerConnection({ iceServers })
              setupPeerConnectionListeners(peerConnection)
              for (const track of localStream.getTracks()) {
                peerConnection.addTrack(track)
              }
              // add offer and create answer
              await peerConnection.setRemoteDescription(args.payload.offer)
              const answer = await peerConnection.createAnswer()
              if (answer.sdp && answer.type == 'answer') {
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
          }
          break
        }
      }
    })
  })

  function hangUp() {
    window.api.hangUpAndCloseVideoCall(pk)
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
</script>

<div id="callWindow">
  <video id="remoteVideo" bind:this={remoteVideoElement} autoplay></video>
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
  #remoteVideo {
    position: absolute;
    width: 100%;
    height: 100%;
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
