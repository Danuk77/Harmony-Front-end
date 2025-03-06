<script lang="ts">
  import * as yup from 'yup'
  import { store } from '../../redux'
  import ScrollContainer from '../../components/ScrollContainer.svelte'
  import MenuForm from '../../components/MenuForm.svelte'

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

  const iceServerRegex = /^(((?:stun|turn):[^\n]+)(\n(?:stun|turn):[^\n]+)*)?$/

  const iceServerSchema = yup.object({
    servers: yup.string().matches(iceServerRegex, 'Each should begin with "stun:" or "turn:"')
  })

  let cleanIceServerValues: yup.InferType<typeof iceServerSchema> = $derived({
    servers: $store.user.iceServers.map(({ urls }) => urls).join('\n')
  })

  let iceServerForm = $state<MenuForm<typeof iceServerSchema>>()

  const onSubmitICEServers = (values: yup.InferType<typeof iceServerSchema>) => {
    let serverURLs = values.servers?.split('\n') ?? []
    if (values.servers == '') {
      serverURLs = []
    }
    store.dispatch({
      type: 'set-ice-servers',
      payload: serverURLs.map((serverURL) => ({ urls: serverURL }))
    })
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
    labels={{ servers: 'STUN/TURN server URLs - one per line' }}
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
