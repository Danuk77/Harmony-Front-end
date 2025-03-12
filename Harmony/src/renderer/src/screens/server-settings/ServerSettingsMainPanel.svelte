<script lang="ts">
  import * as yup from 'yup'
  import { store } from '../../redux'
  import ScrollContainer from '../../components/ScrollContainer.svelte'
  import MenuForm from '../../components/MenuForm.svelte'
  import type { IceServer } from '../../../../common/redux'

  const protocolRegex = /^(wss?):\/\//

  const harmonyServerSchema = yup.object({
    url: yup
      .string()
      .matches(protocolRegex, 'Please specify protocol ("ws://" or "wss://")')
      .required('This field is required')
  })

  const onSubmitHarmonyServer = (values: yup.InferType<typeof harmonyServerSchema>) => {
    store.dispatch({ type: 'set-server-url', payload: values.url })
  }

  // const iceServerRegex = /^(((?:stun|turn):[^\n]+)(\n(?:stun|turn):[^\n]+)*)?$/

  const iceServerSchema = yup.object({
    stunServerURL: yup.string(),
    turnServerURL: yup.string(),
    turnServerUsername: yup.string(),
    turnServerCredential: yup.string()
  })

  let cleanIceServerValues: yup.InferType<typeof iceServerSchema> = $derived({
    stunServerURL: $store.user.stunServer?.urls.slice(5) ?? '',
    turnServerURL: $store.user.turnServer?.urls.slice(5) ?? '',
    turnServerUsername: $store.user.turnServer?.username ?? '',
    turnServerCredential: $store.user.turnServer?.credential ?? ''
  })

  let iceServerForm = $state<MenuForm<typeof iceServerSchema>>()

  const onSubmitICEServers = (_values: yup.InferType<typeof iceServerSchema>) => {
    const values = {
      stunServerURL: _values.stunServerURL ?? '',
      turnServerCredential: _values.turnServerCredential ?? '',
      turnServerURL: _values.turnServerURL ?? '',
      turnServerUsername: _values.turnServerUsername ?? ''
    }

    let setSTUN = false
    let setTURN = false

    if (values.stunServerURL != '') {
      setSTUN = true
      // add "stun:"
      if (values.stunServerURL.slice(0, 5) != 'stun:') {
        values.stunServerURL = 'stun:' + values.stunServerURL
      }
    }

    if (values.turnServerURL != '') {
      setTURN = true
      if (values.turnServerURL.slice(0, 5) != 'turn:') {
        // add "turn:"
        values.turnServerURL = 'turn:' + values.turnServerURL
      }
    } else {
      // give error if there are credentials provided without stun server addr.
      if (values.turnServerCredential != '' || values.turnServerUsername != '') {
        window.api.showMessageBox({
          message: 'TURN credentials provided, but no TURN server specified!',
          type: 'error'
        })
        return
      }
    }

    const newSTUN: IceServer | null = setSTUN
      ? {
          urls: values.stunServerURL
        }
      : null

    const newTURN: IceServer | null = setTURN
      ? {
          urls: values.turnServerURL,
          credential: values.turnServerCredential != '' ? values.turnServerCredential : undefined,
          username: values.turnServerUsername != '' ? values.turnServerUsername : undefined
        }
      : null

    store.dispatch({ type: 'set-stun-server', payload: newSTUN })
    store.dispatch({ type: 'set-turn-server', payload: newTURN })

    iceServerForm?.reset()
  }
</script>

<ScrollContainer>
  <MenuForm
    legend="Harmony Server"
    schema={harmonyServerSchema}
    cleanValues={{
      url: $store.user.serverUrl ?? ''
    }}
    labels={{ url: 'Websocket URL' }}
    onSubmit={onSubmitHarmonyServer}
  />

  {#if $store.connection.state == 'disconnected' && $store.connection.failedConnectMsg}
    <p id="connectError">Failed: {$store.connection.failedConnectMsg}</p>
  {/if}

  <div id="checkboxes">
    <input
      id="serverEnabled"
      name="serverEnabled"
      bind:checked={() => $store.user.serverEnabled,
      (v) => store.dispatch({ type: 'set-server-enabled', payload: v })}
      type="checkbox"
    />
    <label for="serverEnabled">Enable Harmony server</label>
  </div>

  <br />

  <MenuForm
    bind:this={iceServerForm}
    legend="ICE Servers"
    schema={iceServerSchema}
    cleanValues={cleanIceServerValues}
    labels={{
      stunServerURL: 'STUN Server URL (optional) - required for connections outside LAN',
      turnServerURL: 'TURN Server URL (optional)',
      turnServerUsername: 'TURN Server Username (optional)',
      turnServerCredential: 'TURN Server Credential (optional)'
    }}
    onSubmit={onSubmitICEServers}
  />
</ScrollContainer>

<style>
  #checkboxes {
    width: 90%;
    max-width: 700px;
  }
  #connectError {
    color: var(--color-text-error);
    margin-bottom: 10px;
  }
</style>
