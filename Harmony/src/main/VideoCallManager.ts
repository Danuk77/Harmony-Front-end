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
  // id of in-progress call. Prevents multiple errors for the same call, or an error from the previous call causing the next call to be cancelled.
  id: number | null
  errorMsg: string | null
}

export class VideoCallManager {
  private friendPk: string
  private _videoCallStatus: FriendVideoCallStatus = defaultVideoCallStatus
  public onVideoCallStatusChange: (status: typeof this._videoCallStatus) => unknown
  public browserWindow: BrowserWindow | null = null
  public routineManager: VideoCallRoutine
  public fch: FriendConnectionHandler
  private nextCallId: number = 1

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
      browserWindow.show()
    })

    browserWindow.on('closed', () => {
      this.browserWindow = null
      this.hangUpAndClose()
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
      browserWindow.loadURL(`file://${__dirname}/../renderer/videocall.html?pk=${encodedPk}`)
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
      this.browserWindow = null
    }

    // decline any current call
    if (this.routineManager.currentSignalling) {
      this.routineManager.rejectCall().catch(() => {})
    }

    // set state
    this.videoCallStatus = {
      callDirection: 'none',
      accepted: false,
      window: 'closed',
      call: 'none',
      errorMsg: null,
      id: null
    }
  }

  // orange
  public async receiveVideoCallRequest(
    { send, recv }: HarmonyRoutineParams,
    resolve: Parameters<ConstructorParameters<typeof Promise<void>>[0]>[0],
    reject: Parameters<ConstructorParameters<typeof Promise<void>>[0]>[1]
  ) {
    this.fch.logger.info('Received video call request')
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
    const id = this.nextCallId++
    this.videoCallStatus = {
      ...this.videoCallStatus,
      callDirection: 'incoming',
      call: call,
      id: id
    }

    this.routineManager.setCurrentSignalling({
      send,
      recv,
      resolve,
      reject: (reason) => {
        // decorate calls to reject() so we can call this.error
        this.error('routine', eToStr(reason), id)
        return reject(reason)
      },
      state: 'incoming',
      id
    })
    this.routineManager.startRecvLoop()
    this.routineManager.startWaitLoop()

    // get window to generate sdp if call is accepted
    if (call == 'signalling') {
      this.routineManager.acceptIncomingCallWithWindowOpen(id)
    }
    // if call is set to signalling the signalling process must restart with us sending an offer sdp.
  }

  // green
  public async windowOpens() {
    const oldStatus = this.videoCallStatus
    // window switches to "open"
    // rest of the state stays the same unless...
    if (
      oldStatus.callDirection == 'incoming' &&
      oldStatus.accepted &&
      oldStatus.call == 'ringing' &&
      oldStatus.id !== null
    ) {
      // additionally set call to "signalling" and accept incoming call (generates offer sdp)
      this.videoCallStatus = {
        ...this.videoCallStatus,
        window: 'open',
        call: 'signalling'
      }
      ;((id) => {
        this.routineManager.acceptIncomingCallWithWindowOpen(id).catch((e) => {
          this.error('routine', eToStr(e), id)
        })
      })(oldStatus.id)
    } else {
      this.videoCallStatus = {
        ...this.videoCallStatus,
        window: 'open'
      }
    }

    if (
      oldStatus.callDirection == 'outgoing' &&
      oldStatus.accepted &&
      oldStatus.call == 'signalling' &&
      oldStatus.id !== null
    ) {
      // the peer has already accepted our video call request.
      // the peerOfferSdp should be defined, given the current state
      const peerOfferSdp = this.routineManager.currentSignalling?.peerOfferSdp
      if (!peerOfferSdp) {
        this.error(
          'routine',
          'Internal error: peer offer not found despite being received',
          oldStatus.id
        )
        return
      }

      // deliver offer to renderer
      ;(async (id) => {
        try {
          const answer = await mainToRendererComManager.genSdpAnswerForVideoCall(
            this.friendPk,
            peerOfferSdp,
            id
          )
          await this.routineManager.forwardSdpAnswerToPeer(answer)
        } catch (e) {
          this.error('routine', eToStr(e), id)
          return
        }
      })(oldStatus.id)
    }
  }

  // dark blue
  public async peerAccepts() {
    // make a copy for ts reasons
    const oldStatus = this.videoCallStatus

    if (
      !(
        oldStatus.callDirection == 'outgoing' &&
        oldStatus.accepted &&
        (oldStatus.window == 'opening' || oldStatus.window == 'open') &&
        oldStatus.call == 'ringing' &&
        oldStatus.id !== null
      )
    ) {
      this.fch.logger.warn(
        'peerAccepts called in bad state and was ignored: ' + JSON.stringify(this.videoCallStatus)
      )
      return
    }

    this.videoCallStatus = {
      ...oldStatus,
      call: 'signalling'
    }

    // if window is open we can deliver the sdp
    if (this.videoCallStatus.window == 'open') {
      const peerOfferSdp = this.routineManager.currentSignalling?.peerOfferSdp
      if (!peerOfferSdp) {
        this.error(
          'routine',
          eToStr('Internal error: peer offer not found despite being received'),
          oldStatus.id
        )
        return
      }
      // deliver offer to renderer
      ;(async (id) => {
        try {
          const answer = await mainToRendererComManager.genSdpAnswerForVideoCall(
            this.friendPk,
            peerOfferSdp,
            id
          )
          await this.routineManager.forwardSdpAnswerToPeer(answer)
        } catch (e) {
          this.error('routine', eToStr(e), id)
          return
        }
      })(oldStatus.id)
    }
  }

  // brown
  public async error(procedure: 'routine' | 'videoPlayer', msg: string, callID: number) {
    // if error originates from a previous call, ignore it
    if (this.videoCallStatus.id != callID) {
      return
    }

    if (procedure == 'routine') {
      if (this.routineManager.currentSignalling) {
        try {
          await this.routineManager.cancelCurrentRoutine()
        } catch {}
      }
      // if we are already in-call we don't care about errors in the routine
      if (this.videoCallStatus.call == 'in-call') {
        return
      }
    }

    this.fch.logger.error('Video call error: ' + msg)

    switch (this.videoCallStatus.window) {
      case 'closed': {
        // ignore
        this.videoCallStatus = {
          callDirection: 'none',
          accepted: false,
          window: 'closed',
          call: 'none',
          errorMsg: msg,
          id: null
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
          errorMsg: msg,
          id: null
        }
        return
      }
      default:
        assertNever(this.videoCallStatus.window)
    }
  }

  // teal
  public async signallingComplete(id: number) {
    if (id != this.videoCallStatus.id) {
      return
    }
    this.videoCallStatus = {
      ...this.videoCallStatus,
      call: 'in-call'
    }
  }

  // pink
  public async peerHangsUp(id: number) {
    if (id != this.videoCallStatus.id) {
      return // ignore
    }

    // check current state is valid for this action
    const oldStatus = this.videoCallStatus
    if (
      !(
        (oldStatus.callDirection == 'outgoing' || oldStatus.callDirection == 'incoming') &&
        (oldStatus.call == 'in-call' ||
          oldStatus.call == 'ringing' ||
          oldStatus.call == 'signalling') &&
        oldStatus.id !== null
      )
    ) {
      this.fch.logger.warn(
        'peerHangsUp called in bad state and was ignored: ' + JSON.stringify(this.videoCallStatus)
      )
      return
    }

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
          errorMsg: null,
          id: null
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
          errorMsg: null,
          id: null
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

    // check current state is valid for this action
    const oldStatus = this.videoCallStatus
    if (
      !(
        oldStatus.callDirection == 'incoming' &&
        !oldStatus.accepted &&
        oldStatus.call == 'ringing' &&
        oldStatus.id !== null
      )
    ) {
      this.fch.logger.warn(
        'weAccept called in bad state and was ignored: ' + JSON.stringify(this.videoCallStatus)
      )
      return
    }

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
          errorMsg: null,
          id: oldStatus.id
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
          errorMsg: null,
          id: oldStatus.id
        }
        ;((id) => {
          // start signalling
          this.routineManager.acceptIncomingCallWithWindowOpen(id).catch((e) => {
            this.error('routine', eToStr(e), id)
          })
        })(oldStatus.id)
        this.focusVideoCallWindow()
        return
      }
      default:
        assertNever(this.videoCallStatus.window)
    }
  }

  // light blue
  public async sendVideoCallRequest() {
    this.fch.logger.info('Sending video call request')

    // don't check the current state
    // user may want to start a new video call at any time due to issues - allow them

    try {
      await this.routineManager.cancelCurrentRoutine()
    } catch {}

    const id = this.nextCallId++

    switch (this.videoCallStatus.window) {
      case 'opening':
      case 'closed': {
        this.videoCallStatus = {
          callDirection: 'outgoing',
          accepted: true,
          window: 'opening',
          call: 'ringing',
          errorMsg: null,
          id: id
        }
        // start routine
        sendVideoCallRequest(this.fch, id).catch((e) => {
          this.error('routine', eToStr(e), id)
        })

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
          errorMsg: null,
          id: id
        }
        // start routine
        sendVideoCallRequest(this.fch, id).catch((e) => {
          this.error('routine', eToStr(e), id)
        })
        this.focusVideoCallWindow()
        return
      }
      default:
        assertNever(this.videoCallStatus.window)
    }
  }
}
