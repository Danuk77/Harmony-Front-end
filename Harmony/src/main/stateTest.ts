import { State } from './State'

const pk0 =
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const pk1 =
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

export async function stateTest0() {
  const state = new State(pk0)

  state.onMainToRendererAction = async (action) => {
    console.log(action)
    // let friendAdded = false
    // if (!friendAdded && action.type == 'websocket-status-change' && action.payload == 'logged-in') {
    //   friendAdded = true

    //   const result = await state.sendFriendRequest(pk0, pk1)

    //   if (result.status == 'succeed' && result.type == 'accept') {
    //     state.sendMessage(pk0, pk1, 'hello pk1')
    //   }
    // }
  }
}

export async function stateTest1() {
  const state = new State(pk1)

  state.onMainToRendererAction = async (action) => {
    console.log(action)
    let friendAdded = false
    if (!friendAdded && action.type == 'websocket-status-change' && action.payload == 'logged-in') {
      friendAdded = true

      state.sendFriendRequest(pk1, pk0)
    }

    if (action.type == 'friend-change' && action.payload.connectionStatus == 'online-connected') {
      state.sendMessage(pk1, pk0, 'hello pk0')
    }
  }
}
