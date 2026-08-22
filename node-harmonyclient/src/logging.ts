/**logger used if no logger is provided */

import winston from 'winston'

const logFormat = winston.format.printf(({ level, message, timestamp }) => {
  return `${timestamp} [nhcli ${level}]: ${message}`
})

export function newDefaultLogger() {
  return winston.createLogger({
    transports: [new winston.transports.Console({ forceConsole: true })],
    exitOnError: false,
    format: winston.format.combine(winston.format.timestamp(), winston.format.colorize(), logFormat)
  })
}
