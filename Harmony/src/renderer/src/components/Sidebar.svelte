<script>
  import FriendBlock from './FriendBlock.svelte'
  import { friends, ui } from '../state.svelte'
  import { store } from '../redux/store'
</script>

<div id="sidebar">
  <div id="friend-list">
    {#each friends.values() as friend}
      <FriendBlock
        selected={friend.peerPk == ui.selectedFriendPk}
        {friend}
        onclick={() => {
          ui.selectedFriendPk = friend.peerPk
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
