<script>
  import MenuTopBar from '../../components/MenuTopBar.svelte'
  import { store } from '../../redux'
  function navigateBack() {
    store.dispatch({ type: 'set-screen-mode', payload: 'user-settings' })
  }
</script>

<MenuTopBar {navigateBack} title="Edit Keypair" />
