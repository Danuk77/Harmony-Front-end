<script>
  import FriendBlock from './FriendBlock.svelte'
  import { store } from '../redux'
</script>

<div id="sidebar">
  <div id="friend-list">
    {#each $store.friendStates as fs}
      <FriendBlock
        selected={fs.friend.peerPk == $store.ui.selectedFriendPk}
        {fs}
        onclick={() => {
          store.dispatch({ type: 'setSelectedFriendPk', payload: { pk: fs.friend.peerPk } })
          console.log(store.getState())
        }}
      />
    {/each}
  </div>
</div>

<style>
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
