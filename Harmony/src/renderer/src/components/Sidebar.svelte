<script lang="ts">
  import FriendBlock from './FriendBlock.svelte'
  import { store } from '../redux'
  import '@fortawesome/fontawesome-free/css/all.min.css'
  import '@fortawesome/fontawesome-free/js/all.min.js'
  import HarmonyIcon from './HarmonyIcon.svelte'
  import LocalStatusBubble from './LocalStatusBubble.svelte'
  import type { FriendState } from '../../../common/redux'
  import { changeFriendStatus } from '../endpointIoWrappers'

  function navigateToAddFriendScreen() {
    store.dispatch({ type: 'set-screen-mode', payload: 'add-friend' })
  }

  async function friendBlockContextMenu(fs: FriendState) {
    // make const copy to prevent typescript error
    const localPk = $store.user.keyPair?.publicKey

    if (localPk) {
      const result = await window.api.showFriendBlockContextMenu(fs.friend)
      if (result) {
        changeFriendStatus(fs.friend, result)
      }
    }
  }
</script>

<div id="sidebar">
  <div id="friend-list-scroll-container">
    <div id="friend-list">
      <div id="add-friend-button">
        <HarmonyIcon
          onclick={navigateToAddFriendScreen}
          ariaLabel="Add friend"
          icon="fa-user-plus"
        />
      </div>

      {#each $store.friendStates as fs}
        {#if fs.friend.status != 'blocked'}
          <FriendBlock
            hasUnreadMessages={fs.friend.hasUnreadMessages}
            selected={fs.friend.peerPk == $store.ui.selectedFriendPk}
            {fs}
            onclick={() => {
              store.dispatch({ type: 'setSelectedFriendPk', payload: { pk: fs.friend.peerPk } })
              if (fs.friend.status == 'friend-request:awaiting-our-response') {
                // if friend invitation, set mode to edit
                if ($store.ui.screenMode != 'edit-friend') {
                  store.dispatch({ type: 'set-screen-mode', payload: 'edit-friend' })
                }
              } else {
                // set mode to chat
                if ($store.ui.screenMode != 'chat') {
                  store.dispatch({ type: 'set-screen-mode', payload: 'chat' })
                }
              }

              // unset hasUnreadMessages
              if (fs.friend.hasUnreadMessages) {
                store.dispatch({
                  type: 'friend-change',
                  payload: {
                    friend: {
                      localPk: fs.friend.localPk,
                      peerPk: fs.friend.peerPk,
                      hasUnreadMessages: false
                    }
                  }
                })
              }
            }}
            oncontextmenu={() => friendBlockContextMenu(fs)}
          />
        {/if}
      {/each}
    </div>
  </div>
  <LocalStatusBubble />
</div>

<style>
  #add-friend-button {
    padding: 10px;
    width: fit-content;
    align-self: flex-end;
  }
  #friend-list-scroll-container {
    width: 100%;

    overflow-y: scroll;
    overflow-x: hidden;
    flex-grow: 1;
    justify-content: center;
    display: flex;
  }
  #friend-list {
    width: 90%;
    display: flex;
    flex-direction: column;
  }
  #sidebar {
    display: flex;
    align-items: center;
    flex-direction: column;
    height: 100%;
  }
</style>
