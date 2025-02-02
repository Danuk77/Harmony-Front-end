<script>
  import FriendBlock from './FriendBlock.svelte'
  import { store } from '../redux'
  import '@fortawesome/fontawesome-free/css/all.min.css'
  import '@fortawesome/fontawesome-free/js/all.min.js'
  import HarmonyIcon from './HarmonyIcon.svelte'

  function navigateToAddFriendScreen() {
    store.dispatch({ type: 'set-screen-mode', payload: 'add-friend' })
  }
</script>

<div id="sidebar">
  <div id="friend-list">
    <div id="add-friend-button">
      <HarmonyIcon onclick={navigateToAddFriendScreen} ariaLabel="Add friend" icon="fa-user-plus" />
    </div>

    {#each $store.friendStates as fs}
      {#if fs.friend.status != 'block'}
        <FriendBlock
          selected={fs.friend.peerPk == $store.ui.selectedFriendPk}
          {fs}
          onclick={() => {
            store.dispatch({ type: 'setSelectedFriendPk', payload: { pk: fs.friend.peerPk } })
            // set mode to chat
            if ($store.ui.screenMode != 'chat') {
              store.dispatch({ type: 'set-screen-mode', payload: 'chat' })
            }
          }}
        />
      {/if}
    {/each}
  </div>
</div>

<style>
  #add-friend-button {
    float: right;
    padding: 10px;
  }
  #friend-list {
    width: 90%;

    overflow-y: scroll;
    overflow-x: hidden;
  }
  #sidebar {
    display: flex;
    justify-content: center;
    height: 100%;
  }
</style>
