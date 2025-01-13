import type { FriendWithState } from '../../../preload'

export function connectionStatusToBulbColorCssVariable(
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
