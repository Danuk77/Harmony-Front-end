export const capabilities = [
  'getCapabilities',
  'message',
  // 'verifyIdentity',
  'getECDHPublicKey',
  'videoCallRequest'
] as const

// different versions of the same routine that this client supports.
// e.g. if capAlternatives.message = ["message1.0", "message"]
// then message1.0 is preferred over message.
// message should only be used if the client does not have the message1.0 capability
export const capAlternatives = {
  getCapabilities: ['getCapabilities'],
  getECDHPublicKey: ['getECDHPublicKey'],
  message: ['message'],
  // verifyIdentity: ['verifyIdentity'],
  videoCallRequest: ['videoCallRequest']
} as const
