<script lang="ts">
  import { store } from '../../redux'
  import ExpandableBubble from '../../components/ExpandableBubble.svelte'
  import {
    friendBlockContextMenuAvailableOptions,
    type FriendBlockContextMenuOptions
  } from '../../../../common/friendBlockContextMenu'
  import { changeFriendStatus } from '../../endpointIoWrappers'

  const friendState = $derived.by(() =>
    $store.friendStates.find(
      (fs) => fs.friend.peerPk == $store.ui.selectedFriendPk && fs.friend.localPk == $store.user.pk
    )
  )

  const optionToText = (option: FriendBlockContextMenuOptions) => {
    switch (option) {
      case 'delete':
        return 'Delete friend record'
      case 'edit':
        return ''
      case 'block':
        return 'Block friend'
      case 'unblock':
        return 'Unblock and send friend request'
      case 'accept':
        return 'Accept friend request'
    }
  }

  const onclickOption = (option: FriendBlockContextMenuOptions) => {
    if (friendState) changeFriendStatus(friendState.friend, option)
  }
</script>

<div id="container">
  <div id="scroll-container">
    <div id="form">
      {#if friendState}
        <ExpandableBubble value={friendState.friend.peerPk} label="Public Key" readonly={true} />
        <ExpandableBubble
          bind:value={() => friendState.friend.nickname,
          (newNickname) =>
            store.dispatch({
              type: 'friend-change',
              payload: {
                friend: {
                  localPk: friendState.friend.localPk,
                  peerPk: friendState.friend.peerPk,
                  nickname: newNickname
                }
              }
            })}
          label="Nickname"
        />

        {#each friendBlockContextMenuAvailableOptions(friendState.friend) as option}
          {#if option != 'edit'}
            <a href={undefined} class="option" onclick={() => onclickOption(option)}
              >{optionToText(option)}</a
            >
          {/if}
        {/each}
      {/if}
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
