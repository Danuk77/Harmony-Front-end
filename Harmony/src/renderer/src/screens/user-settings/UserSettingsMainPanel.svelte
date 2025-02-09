<script lang="ts">
  import * as yup from 'yup'
  import { store } from '../../redux'
  import { collectYupErrorsByField } from '../../misc/utils'
  import ExpandableBubble from '../../components/ExpandableBubble.svelte'

  const schema = yup.object({
    pk: yup
      .string()
      .required('This field is required')
      .matches(/^\s*[0123456789abcdefABCDEF]{128}\s*$/, 'Should be 128 hexadecimal digits')
  })

  let values = $state<yup.InferType<typeof schema>>({
    pk: $store.user.pk ?? ''
  })

  let formErrors = $derived(collectYupErrorsByField(schema, values))
  let showErrors = $state(false)

  const handleSubmit: HTMLFormElement['onsubmit'] = (event) => {
    event.preventDefault()
    showErrors = true

    if (schema.isValidSync(values)) {
      // remove whitespace from pk and make lower
      const pk = values.pk.toLowerCase().replace(/\s/g, '')

      store.dispatch({ type: 'set-local-pk', payload: pk })
    }
  }
</script>

<div id="container">
  <div id="scroll-container">
    <div id="form">
      <form onsubmit={handleSubmit}>
        <ExpandableBubble
          bind:value={values.pk}
          label="Public Key"
          error={showErrors && formErrors.pk.length > 0 ? formErrors.pk[0] : undefined}
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
