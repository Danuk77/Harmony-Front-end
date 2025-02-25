<script lang="ts">
  import * as yup from 'yup'
  import { store } from '../../redux'
  import MenuForm from '../../components/MenuForm.svelte'
  import type { ComponentProps } from 'svelte'
  import { base64Regex } from '../../../../common/types'

  const schema = yup.object({
    publicKey: yup
      .string()
      .required('This field is required')
      .matches(
        base64Regex,
        'Public key should be a base64-encoded ed25519 verifying key exported in SPKI/DER format.'
      ),
    privateKey: yup
      .string()
      .required('This field is required')
      .matches(
        base64Regex,
        'Private key should be a base64-encoded ed25519 signing key exported in PKCS#8/DER format.'
      )
  })

  let keyPairForm: MenuForm<typeof schema>

  // compare current values against these to see if the form is dirty
  let cleanValues: yup.InferType<typeof schema> = $derived({
    publicKey: $store.user.keyPair?.publicKey ?? '',
    privateKey: $store.user.keyPair?.privateKey ?? ''
  })

  const onSubmit: ComponentProps<typeof keyPairForm>['onSubmit'] = async (values) => {
    // check that keys match cryptographically
    const result = await window.api.verifyKeyPair({
      privateKey: values.privateKey,
      publicKey: values.publicKey
    })

    if (!result.isValid) {
      await window.api.showMessageBox({
        message: 'New key not set',
        detail: result.message,
        type: 'error'
      })
      return
    }

    const promptResult = await window.api.showMessageBox({
      message: 'Setting a new key pair will replace your current one.',
      detail: 'You will need to re-add all friends using the new public key. Proceed?',
      buttons: ['Cancel', 'Continue'],
      type: 'warning'
    })

    if (promptResult.response != 1) {
      return
    }

    store.dispatch({
      type: 'set-key-pair',
      payload: {
        privateKey: values.privateKey,
        publicKey: values.publicKey
      }
    })
  }

  const generateNewKeyPair = async () => {
    const result = await window.api.showMessageBox({
      message: 'Generating a new key pair will replace your current one.',
      detail: 'You will need to re-add all friends using the new public key. Proceed?',
      buttons: ['Cancel', 'Continue'],
      type: 'warning'
    })

    if (result.response != 1) {
      return
    }

    const keyPair = await window.api.generateKeyPair()

    store.dispatch({ type: 'set-key-pair', payload: keyPair })
    keyPairForm.reset() // replace values in form with new ones
  }
</script>

<div id="container">
  <div id="scroll-container">
    <div id="form">
      <MenuForm
        {schema}
        labels={{ privateKey: 'Private Key', publicKey: 'Public Key' }}
        {cleanValues}
        {onSubmit}
        bind:this={keyPairForm}
      />

      <a href={undefined} class="option" onclick={generateNewKeyPair}
        >Generate new public/private keypair</a
      >
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

  .option {
    font-weight: bolder;
  }
  .option:hover {
    opacity: 0.8;
    cursor: pointer;
  }
</style>
