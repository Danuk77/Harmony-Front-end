import { FriendRequestResult } from 'node-harmonyclient'
import winston from 'winston'
import { store } from './redux'
import { FriendConnectionStatus } from './FriendConnectionHandler'

const connectionStateColors: Record<FriendConnectionStatus, string> = {
  'encrypted-connected': 'green',
  'unencrypted-connected': 'yellow',
  connecting: 'yellow',
  failed: 'red',
  'online-disconnected': 'grey',
  closed: 'grey',
  offline: 'grey',
  rejected: 'grey',
  unknown: 'grey',
  unset: 'grey',
  'do-not-connect': 'grey'
}
winston.addColors(connectionStateColors)
const colorizer = winston.format.colorize()

export type PeerLoggerMetadata = {
  pk: string
}

type AdditionalLoggerMetadata = {
  peer?: PeerLoggerMetadata
}

function loggerChildTypesafe(metadata: AdditionalLoggerMetadata) {
  return logger.child(metadata)
}

export function getPeerLogger(metadata: PeerLoggerMetadata) {
  return loggerChildTypesafe({ peer: metadata })
}

export function getShortPk(pk: string) {
  if (pk.length >= 32) {
    return pk.slice(16, 32)
  } else {
    return pk.slice(-16)
  }
}

const logFormat = winston.format.printf(({ level, message, timestamp, ..._rest }) => {
  const rest = _rest as AdditionalLoggerMetadata

  let log = `${timestamp} [Harmony ${level}]:`

  if (rest.peer) {
    const status =
      store.getState().friendStates.find((friend) => friend.friend.peerPk == rest.peer?.pk)
        ?.connectionStatus ?? 'unknown'
    log += ` (pk:${getShortPk(rest.peer.pk)} ${colorizer.colorize(status, status)})`
  }
  log += ` ${message}`

  return log
})

export const logger = winston.createLogger({
  transports: [new winston.transports.Console({ forceConsole: true })],
  exitOnError: false,
  format: winston.format.combine(winston.format.timestamp(), winston.format.colorize(), logFormat),
  level: 'verbose'
})

export function friendRequestResultToString(result: FriendRequestResult): string {
  switch (result.status) {
    case 'fail':
      return `Friend request failed: ${result.msg}`
    case 'offline':
      return `Friend request failed: friend is offline`
    case 'succeed':
      return 'Friend request succeeded'
  }
}
