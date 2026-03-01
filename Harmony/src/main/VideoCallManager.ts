import { HarmonyRoutineParams } from 'node-harmonyclient'
import { mainToRendererComManager } from './MainToRendererComManager'
import { eToStr } from './Controller'
import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import icon from '../../build/icon.png?asset'
import { is } from '@electron-toolkit/utils'
import { VideoCallRoutine } from './friendCtlRoutines/VideoCallRoutine'
import { assertNever } from '../common/utils'
import { FriendConnectionHandler } from './FriendConnectionHandler'
import { sendVideoCallRequest } from './friendCtlRoutines/initiated/sendVideoCallRequest'
import { defaultVideoCallStatus } from '../common/redux'

export type FriendVideoCallStatus = {
  callDirection: 'none' | 'incoming' | 'outgoing'
  accepted: boolean
  window: 'closed' | 'opening' | 'open'
  call: 'ringing' | 'signalling' | 'peer-hang-up' | 'in-call' | 'failed' | 'none'
  errorMsg: string | null
}

export class VideoCallManager {
  private friendPk: string
  private _videoCallStatus: FriendVideoCallStatus = defaultVideoCallStatus
  public onVideoCallStatusChange: (status: typeof this._videoCallStatus) => unknown
  public browserWindow: BrowserWindow | null = null
  public routineManager: VideoCallRoutine
  public fch: FriendConnectionHandler

  constructor(
    friendPk: string,
    onVideoCallStatusChange: typeof this.onVideoCallStatusChange,
    routineManager: typeof this.routineManager,
    fch: typeof this.fch
  ) {
    this.onVideoCallStatusChange = onVideoCallStatusChange
    this.friendPk = friendPk
    this.routineManager = routineManager
    this.fch = fch
  }

  private get videoCallStatus(): FriendVideoCallStatus {
    return this._videoCallStatus
  }
  private set videoCallStatus(videoCallStatus: FriendVideoCallStatus) {
    if (videoCallStatus != this.videoCallStatus) {
      this.onVideoCallStatusChange(videoCallStatus)
    }
    this._videoCallStatus = videoCallStatus
  }

  private focusVideoCallWindow() {
    // check if window exists already
    if (this.browserWindow) {
      if (this.browserWindow.isMinimized()) {
        this.browserWindow.restore()
      }
      this.browserWindow.moveTop()
      this.browserWindow.focus()
    } else {
      this.createVideoCallWindow()
    }
  }

  private createVideoCallWindow() {
    if (this.browserWindow) {
      return this.browserWindow
    }

    const browserWindow = new BrowserWindow({
      width: 480,
      height: 270,
      show: false,
      autoHideMenuBar: true,
      ...(process.platform === 'linux' ? { icon } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })
    this.browserWindow = browserWindow

    browserWindow.on('ready-to-show', () => {
      /**@todo update state */
      this.windowOpens()
      browserWindow.show()
    })

    /**@todo think about this - do we need to dispatch a redux event here? would that lead to an infinite loop?  */
    browserWindow.on('closed', () => {
      /**@todo update state */
      if (this.browserWindow == browserWindow) {
        this.browserWindow = null
      }
    })

    browserWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    // HMR for renderer base on electron-vite cli.
    // Load the remote URL for development or the local html file for production.
    const encodedPk = encodeURIComponent(this.friendPk)
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      browserWindow.loadURL(
        `${process.env['ELECTRON_RENDERER_URL']}/videocall.html?pk=${encodedPk}`
      )
    } else {
      browserWindow.loadFile(join(__dirname, `../renderer/videocall.html?pk=${encodedPk}`))
    }

    return browserWindow
  }

  /**
   * State changes =========
   */

  // red
  public async hangUpAndClose() {
    if (this.browserWindow) {
      this.browserWindow.close()
    }

    // decline any current call
    try {
      await this.routineManager.rejectCall()
    } catch {
      try {
        await this.routineManager.cancelCurrentRoutine()
      } catch {}
    }

    // set state
    this.videoCallStatus = {
      callDirection: 'none',
      accepted: false,
      window: 'closed',
      call: 'none',
      errorMsg: null
    }
  }

  // orange
  public async recieveVideoCallRequest(
    { send, recv }: HarmonyRoutineParams,
    resolve: Parameters<ConstructorParameters<typeof Promise<void>>[0]>[0],
    reject: Parameters<ConstructorParameters<typeof Promise<void>>[0]>[1]
  ) {
    // cancel current routine in favour of this one
    try {
      await this.routineManager.cancelCurrentRoutine()
    } catch {}

    // call direction always switches to incoming
    // accept stays the same
    // window stays the same
    // call is set to "signalling" if (accept && window=="open"), else "ringing"
    const call =
      this.videoCallStatus.accepted && this.videoCallStatus.window == 'open'
        ? 'signalling'
        : 'ringing'
    this.videoCallStatus = {
      ...this.videoCallStatus,
      callDirection: 'incoming',
      call: call
    }

    this.routineManager.setCurrentSignalling({
      send,
      recv,
      resolve,
      reject,
      state: 'incoming'
    })
    this.routineManager.startRecvLoop()
    this.routineManager.startWaitLoop()

    // get window to generate sdp if call is accepted
    if (call == 'signalling') {
      this.routineManager.acceptIncomingCallWithWindowOpen()
    }
    // if call is set to signalling the signalling process must restart with us sending an offer sdp.
  }

  // green
  public async windowOpens() {
    // window switches to "open"
    // rest of the state stays the same unless...
    if (
      this.videoCallStatus.callDirection == 'incoming' &&
      this.videoCallStatus.accepted &&
      this.videoCallStatus.call == 'ringing'
    ) {
      // additionally set call to "signalling" and accept incoming call (generates offer sdp)
      this.videoCallStatus = {
        ...this.videoCallStatus,
        window: 'open',
        call: 'signalling'
      }
      this.routineManager.acceptIncomingCallWithWindowOpen().catch((e) => {
        this.error('routine', eToStr(e))
      })
    } else {
      this.videoCallStatus = {
        ...this.videoCallStatus,
        window: 'open'
      }
    }

    if (
      this.videoCallStatus.callDirection == 'outgoing' &&
      this.videoCallStatus.accepted &&
      this.videoCallStatus.call == 'signalling'
    ) {
      // the peer has already accepted our video call request.
      // the peerOfferSdp should be defined, given the current state
      const peerOfferSdp = this.routineManager.currentSignalling?.peerOfferSdp
      if (!peerOfferSdp) {
        this.error('routine', eToStr('Internal error: peer offer not found despite being received'))
        return
      }

      // deliver offer to renderer
      ;(async () => {
        try {
          const answer = await mainToRendererComManager.genSdpAnswerForVideoCall(
            this.friendPk,
            peerOfferSdp
          )
          await this.routineManager.forwardSdpAnswerToPeer(answer)
        } catch (e) {
          this.error('routine', eToStr(e))
          return
        }
      })()
    }
  }

  // dark blue
  public async peerAccepts() {
    if (this.videoCallStatus.callDirection == 'outgoing' && this.videoCallStatus.accepted) {
      this.videoCallStatus = {
        ...this.videoCallStatus,
        call: 'signalling'
      }
      // if window is open we can deliver the sdp
      if (this.videoCallStatus.window == 'open') {
        const peerOfferSdp = this.routineManager.currentSignalling?.peerOfferSdp
        if (!peerOfferSdp) {
          this.error(
            'routine',
            eToStr('Internal error: peer offer not found despite being received')
          )
          return
        }
        // deliver offer to renderer
        ;(async () => {
          try {
            const answer = await mainToRendererComManager.genSdpAnswerForVideoCall(
              this.friendPk,
              peerOfferSdp
            )
            await this.routineManager.forwardSdpAnswerToPeer(answer)
          } catch (e) {
            this.error('routine', eToStr(e))
            return
          }
        })()
      }
    }
  }

  // brown
  public async error(procedure: 'routine' | 'videoPlayer', msg: string) {
    console.error('Video call error: ' + msg)

    if (procedure == 'routine') {
      try {
        await this.routineManager.cancelCurrentRoutine()
      } catch {}
      // if we are already in-call we don't care about errors in the routine
      if (this.videoCallStatus.call == 'in-call') {
        return
      }
    }

    switch (this.videoCallStatus.window) {
      case 'closed': {
        // ignore
        this.videoCallStatus = {
          callDirection: 'none',
          accepted: false,
          window: 'closed',
          call: 'none',
          errorMsg: msg
        }
        return
      }
      case 'opening':
      case 'open': {
        this.videoCallStatus = {
          callDirection: 'none',
          accepted: false,
          window: this.videoCallStatus.window,
          call: 'failed',
          errorMsg: msg
        }
        return
      }
      default:
        assertNever(this.videoCallStatus.window)
    }
  }

  // teal
  public async signallingComplete() {
    this.videoCallStatus.call = 'in-call'
  }

  // pink
  public async peerHangsUp() {
    if (this.routineManager.currentSignalling) {
      this.routineManager.terminateCurrentRoutine()
    }

    switch (this.videoCallStatus.window) {
      case 'closed': {
        // ignore
        this.videoCallStatus = {
          callDirection: 'none',
          accepted: false,
          window: 'closed',
          call: 'none',
          errorMsg: null
        }
        return
      }
      case 'open':
      case 'opening': {
        this.videoCallStatus = {
          callDirection: 'none',
          accepted: false,
          window: this.videoCallStatus.window,
          call: 'peer-hang-up',
          errorMsg: null
        }
        return
      }
      default:
        assertNever(this.videoCallStatus.window)
    }
  }

  // yellow
  public async weAccept() {
    // callDirection is "incoming", unchanged.
    // accepted changes from false to true
    // if window is "closed", it changes to "opening" (and window is opened). Otherwise remains the same
    // if window is "open", call changes to "signalling" (and signalling begins) otherwise call stays at "ringing"

    if (
      this.videoCallStatus.callDirection == 'incoming' &&
      !this.videoCallStatus.accepted &&
      this.videoCallStatus.call == 'ringing'
    ) {
      const callDirection = 'incoming'
      const accepted = true
      switch (this.videoCallStatus.window) {
        case 'opening':
        case 'closed': {
          this.videoCallStatus = {
            callDirection,
            accepted,
            call: 'ringing',
            window: 'opening',
            errorMsg: null
          }
          // open window
          this.focusVideoCallWindow()
          return
        }
        case 'open': {
          this.videoCallStatus = {
            callDirection,
            accepted,
            call: 'signalling',
            window: 'open',
            errorMsg: null
          }
          // start signalling
          this.routineManager.acceptIncomingCallWithWindowOpen().catch((e) => {
            this.error('routine', eToStr(e))
          })
          return
        }
        default:
          assertNever(this.videoCallStatus.window)
      }
    }
  }

  // light blue
  public async sendVideoCallRequest() {
    try {
      await this.routineManager.cancelCurrentRoutine()
    } catch {}

    switch (this.videoCallStatus.window) {
      case 'opening':
      case 'closed': {
        this.videoCallStatus = {
          callDirection: 'outgoing',
          accepted: true,
          window: 'opening',
          call: 'ringing',
          errorMsg: null
        }
        // start routine
        sendVideoCallRequest(this.fch)
        // open window
        this.focusVideoCallWindow()
        return
      }
      case 'open': {
        this.videoCallStatus = {
          callDirection: 'outgoing',
          accepted: true,
          window: 'open',
          call: 'ringing',
          errorMsg: null
        }
        // start routine
        sendVideoCallRequest(this.fch)
        return
      }
      default:
        assertNever(this.videoCallStatus.window)
    }
  }
}
