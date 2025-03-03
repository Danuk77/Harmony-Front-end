<script lang="ts">
  import * as yup from 'yup'
  import { store } from '../../redux'
  import { collectYupErrorsByField } from '../../misc/utils'
  import ExpandableBubble from '../../components/ExpandableBubble.svelte'
  import ScrollContainer from '../../components/ScrollContainer.svelte'

  const protocolRegex = /^(wss?):\/\//

  const schema = yup.object({
    url: yup
      .string()
      .matches(protocolRegex, 'Please specify protocol ("ws://" or "wss://")')
      .required('This field is required')
  })

  let values = $state<yup.InferType<typeof schema>>({
    url: $store.user.serverUrl ?? ''
  })

  let formErrors = $derived(collectYupErrorsByField(schema, values))
  let showErrors = $state(false)

  const handleSubmit: HTMLFormElement['onsubmit'] = (event) => {
    event.preventDefault()
    showErrors = true

    if (schema.isValidSync(values)) {
      store.dispatch({ type: 'set-server-url', payload: values.url })
    }
  }
</script>

<ScrollContainer>
  <form onsubmit={handleSubmit}>
    <ExpandableBubble
      bind:value={values.url}
      label="Websocket URL"
      error={showErrors && formErrors.url.length > 0 ? formErrors.url[0] : undefined}
    />
    <input type="submit" id="submit" value="Confirm" />
  </form>
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
    <label for="serverEnabled">Enable server</label>
  </div>
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
