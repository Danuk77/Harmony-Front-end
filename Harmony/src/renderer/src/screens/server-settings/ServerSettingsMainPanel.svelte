<script lang="ts">
  import * as yup from 'yup'
  import { store } from '../../redux'
  import { collectYupErrorsByField } from '../../misc/utils'
  import ExpandableBubble from '../../components/ExpandableBubble.svelte'

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

<div id="container">
  <div id="scroll-container">
    <div id="form">
      <form onsubmit={handleSubmit}>
        <ExpandableBubble
          bind:value={values.url}
          label="Websocket URL"
          error={showErrors && formErrors.url.length > 0 ? formErrors.url[0] : undefined}
        />
        <input type="submit" id="submit" value="Confirm" />
      </form>
    </div>

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
  </div>
</div>

<style>
  #container {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    overflow: hidden;
  }
  #scroll-container {
    width: 100%;
    overflow-y: scroll;
    align-items: center;
    display: flex;
    flex-direction: column;
    flex-grow: 1;
  }
  #form {
    /* margin-top: auto; bottom-justifys content */
    margin-top: 20px;
    margin-bottom: 20px;
    width: 90%;
    max-width: 700px;
    display: flex;
    flex-direction: column;
  }
  #checkboxes {
    width: 90%;
    max-width: 700px;
  }
</style>
