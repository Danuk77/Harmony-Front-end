<script>
  import MenuTopBar from '../../components/MenuTopBar.svelte'
  import { store } from '../../redux'
  function navigateBack() {
    store.dispatch({ type: 'set-screen-mode', payload: 'chat' })
  }
</script>

<MenuTopBar {navigateBack} title="Add Friend" />
