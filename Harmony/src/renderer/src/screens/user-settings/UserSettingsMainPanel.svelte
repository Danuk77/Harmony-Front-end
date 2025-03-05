<script lang="ts">
  import { store } from '../../redux'
  import ScrollContainer from '../../components/ScrollContainer.svelte'
  import ExpandableBubble from '../../components/ExpandableBubble.svelte'
  import SettingsOption from '../../components/SettingsOption.svelte'

  let privateKeyShown = $state(false)

  const generateNewKeyPair = async () => {
    const result = await window.api.showMessageBox({
      message: 'Generating a new key pair will remove your friends.',
      detail: 'You will need to re-add all friends using the new public key. Proceed?',
      buttons: ['Cancel', 'Continue'],
      type: 'warning'
    })

    if (result.response != 1) {
      return
    }

    const keyPair = await window.api.generateKeyPair()

    store.dispatch({ type: 'set-key-pair', payload: keyPair })
    // keyPairForm.reset() // replace values in form with new ones
  }

  const editKeyPairManually = async () => {
    if (!privateKeyShown) {
      const result = await window.api.showMessageBox({
        message: 'This option will display your private key on screen.',
        detail: 'Be careful; this is essentially your password. Proceed?',
        buttons: ['Cancel', 'Continue'],
        type: 'warning'
      })

      if (result.response != 1) {
        return
      }
    }

    store.dispatch({ type: 'set-screen-mode', payload: 'edit-keypair' })
  }

  const showOrHidePrivateKey = async () => {
    if (privateKeyShown) {
      privateKeyShown = false
    } else {
      const result = await window.api.showMessageBox({
        message: 'This option will display your private key on screen.',
        detail: 'Be careful; this is essentially your password. Proceed?',
        buttons: ['Cancel', 'Continue'],
        type: 'warning'
      })

      if (result.response != 1) {
        return
      }

      privateKeyShown = true
    }
  }
</script>

<ScrollContainer>
  <ExpandableBubble
    value={$store.user.keyPair?.publicKey ?? ''}
    label="Public Key"
    readonly={true}
  />
  {#if privateKeyShown}
    <ExpandableBubble
      value={$store.user.keyPair?.privateKey ?? ''}
      label="Private Key"
      readonly={true}
    />
  {/if}
  <SettingsOption onclick={showOrHidePrivateKey}
    >{privateKeyShown ? 'Hide' : 'Show'} private key</SettingsOption
  >
  <SettingsOption onclick={generateNewKeyPair}>Generate new public/private keypair</SettingsOption>
  <SettingsOption onclick={editKeyPairManually}>Edit public/private key manually</SettingsOption>
</ScrollContainer>
