<script lang="ts">
  import * as yup from 'yup'
  import { store } from '../../redux'
  import { collectYupErrorsByField } from '../../misc/utils'
  import ExpandableBubble from '../../components/ExpandableBubble.svelte'

  const schema = yup.object({
    publicKey: yup
      .string()
      .required('This field is required')
      .matches(
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
        'Public key should be a base64-encoded ed25519 verifying key exported in DER format.'
      ),
    privateKey: yup
      .string()
      .required('This field is required')
      .matches(
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
        'Private key should be a base64-encoded ed25519 signing key exported in DER format.'
      )
  })

  let values = $state<yup.InferType<typeof schema>>({
    publicKey: $store.user.keyPair?.publicKey ?? '',
    privateKey: $store.user.keyPair?.privateKey ?? ''
  })

  let formErrors = $derived(collectYupErrorsByField(schema, values))
  let showErrors = $state(false)

  const handleSubmit: HTMLFormElement['onsubmit'] = (event) => {
    event.preventDefault()
    showErrors = true

    if (schema.isValidSync(values)) {
      /**@todo check that the keys match*/

      store.dispatch({
        type: 'set-key-pair',
        payload: {
          privateKey: values.privateKey,
          publicKey: values.publicKey
        }
      })
    }
  }
</script>

<div id="container">
  <div id="scroll-container">
    <div id="form">
      <form onsubmit={handleSubmit}>
        <ExpandableBubble
          bind:value={values.publicKey}
          label="Public Key"
          error={showErrors && formErrors.publicKey.length > 0
            ? formErrors.publicKey[0]
            : undefined}
        />
        <ExpandableBubble
          bind:value={values.privateKey}
          label="Private Key"
          error={showErrors && formErrors.privateKey.length > 0
            ? formErrors.privateKey[0]
            : undefined}
        />
        <input type="submit" id="submit" value="Confirm" />
      </form>
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
</style>
