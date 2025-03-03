<script lang="ts">
  import MenuForm from '../../components/MenuForm.svelte'
  import * as yup from 'yup'
  import { store } from '../../redux'
  import type { ComponentProps } from 'svelte'
  import { base64Regex } from '../../../../common/types'
  import ScrollContainer from '../../components/ScrollContainer.svelte'

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
    const promptResult = await window.api.showMessageBox({
      message: 'Setting a new key pair will remove your friends.',
      detail: 'You will need to re-add all friends using the new public key. Proceed?',
      buttons: ['Cancel', 'Continue'],
      type: 'warning'
    })

    if (promptResult.response != 1) {
      return
    }

    // check that keys match cryptographically
    const result = await window.api.verifyKeyPair({
      privateKey: values.privateKey,
      publicKey: values.publicKey
    })

    if (!result.isValid) {
      await window.api.showMessageBox({
        message: 'Key pair not valid',
        detail: result.message,
        type: 'error'
      })
      return
    }

    store.dispatch({
      type: 'set-key-pair',
      payload: {
        privateKey: values.privateKey,
        publicKey: values.publicKey
      }
    })

    await window.api.showMessageBox({
      message: 'Your key pair was updated.',
      type: 'info'
    })

    store.dispatch({ type: 'set-screen-mode', payload: 'user-settings' })
  }
</script>

<ScrollContainer>
  <MenuForm
    {schema}
    labels={{ privateKey: 'Private Key', publicKey: 'Public Key' }}
    {cleanValues}
    {onSubmit}
    bind:this={keyPairForm}
  />
</ScrollContainer>
