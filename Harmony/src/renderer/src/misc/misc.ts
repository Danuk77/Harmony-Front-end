import type { WebsocketStatusType } from 'node-harmonyclient'
import type { FriendWithState } from '../../../preload'

export function peerConnectionStatusToBulbColorCssVariable(
  status: FriendWithState['connectionStatus']
) {
  switch (status) {
    case 'online-connected':
      return '--color-lightbulb-connected'
    case 'online-disconnected':
      return '--color-lightbulb-disconnected'
    case 'failed':
      return '--color-lightbulb-disconnected'
    case 'offline':
      return '--color-lightbulb-offline'
    case 'unknown':
      return '--color-lightbulb-offline'
    case 'do-not-connect':
      return '--color-lightbulb-offline'
    case 'rejected':
      return '--color-lightbulb-offline'
    case 'connecting':
      return '--color-lightbulb-disconnected'
    case 'closed':
      return '--color-lightbulb-offline'
    case 'unset':
      return '--color-lightbulb-offline'
  }
}

export function serverConnectionStatusToBulbColorCssVariable(status: WebsocketStatusType) {
  switch (status) {
    case 'connecting':
      return '--color-lightbulb-disconnected'
    case 'closed':
      return '--color-lightbulb-offline'
    case 'disconnected':
      return '--color-lightbulb-offline'
    case 'connected':
      return '--color-lightbulb-connected'
    case 'logged-in':
      return '--color-lightbulb-connected'
    case 'login-failed':
      return '--color-lightbulb-connected'
  }
}
