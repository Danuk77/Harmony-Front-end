<script lang="ts">
  import * as yup from 'yup'
  import ExpandableBubble from '../../components/ExpandableBubble.svelte'
  import { store } from '../../redux'
  import { collectYupErrorsByField } from '../../misc/utils'
  import { sendFriendRequest } from '../../endpointIoWrappers'
  import { base64Regex } from '../../../../common/types'

  const formSchema = yup.object({
    pk: yup
      .string()
      .required('This field is required')
      .matches(
        base64Regex,
        'Public key should be a base64-encoded ed25519 verifying key exported in SPKI/DER format.'
      ),
    nickname: yup.string()
  })

  const formDefaults: yup.InferType<typeof formSchema> = {
    pk: '',
    nickname: ''
  }

  let formValues = $state(formDefaults)

  // list of string errors form each field
  const formErrors = $derived(collectYupErrorsByField(formSchema, formValues))

  // true once the user has submitted once
  let showErrors = $state(false)

  const handleSubmit: HTMLFormElement['onsubmit'] = (event) => {
    event.preventDefault()
    showErrors = true

    if (!$store.user.keyPair) {
      window.api.showErrorBox('Your public key is not set', 'Please set a public key and try again')
      return
    }

    if (formSchema.isValidSync(formValues)) {
      // remove whitespace from pk
      const pk = formValues.pk.replace(/\s/g, '')

      // if no nickname provided just use the pk
      let nickname: string | undefined = formValues.nickname
      if (!nickname || nickname.length == 0) {
        nickname = pk
      }

      sendFriendRequest($store.user.keyPair.publicKey, pk, nickname)
    }
  }
</script>

<div id="container">
  <div id="scroll-container">
    <div id="form">
      <form onsubmit={handleSubmit}>
        <ExpandableBubble
          bind:value={formValues.pk}
          label="Friend's Public Key"
          error={showErrors && formErrors.pk.length > 0 ? formErrors.pk[0] : undefined}
        />
        <ExpandableBubble
          bind:value={formValues.nickname}
          label="Nickname"
          error={showErrors && formErrors.nickname.length > 0 ? formErrors.nickname[0] : undefined}
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
