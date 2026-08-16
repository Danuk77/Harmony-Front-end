import { FriendConnectionHandler } from '../../FriendConnectionHandler'

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    terminate: {
      const: 'done'
    },
    capabilities: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: ['terminate', 'capabilities'],
  additionalProperties: false
} as const

export async function sendGetCapabilities(fch: FriendConnectionHandler) {
  return await fch.controlChannelTransactionHandler.launchRoutine(async (_, { send, recv }) => {
    await send({
      initiate: 'getCapabilities'
    })

    const { capabilities } = await recv(schema)
    return capabilities
  })
}
