<script lang="ts">
  import '@fortawesome/fontawesome-free/css/all.min.css'
  import '@fortawesome/fontawesome-free/js/all.min.js'
  import { peerConnectionStatusToBulbColorCssVariable } from '../misc/misc'
  import type { FriendState } from '../../../common/redux'
  import { store } from '../redux'
  import HarmonyIcon from './HarmonyIcon.svelte'
  import { changeFriendStatus } from '../endpointIoWrappers'
  let {
    selected,
    hasUnreadMessages: hasUnreadMessages,
    fs,
    onclick,
    oncontextmenu
  }: {
    selected: boolean
    hasUnreadMessages: boolean
    fs: FriendState
    onclick?: HTMLButtonElement['onclick']
    oncontextmenu?: HTMLButtonElement['oncontextmenu']
  } = $props()

  let backgroundColor = $derived.by(() => {
    const lighten =
      selected && ($store.ui.screenMode == 'chat' || $store.ui.screenMode == 'edit-friend')
    const amber = hasUnreadMessages

    if (amber) {
      if (lighten) {
        return '--color-block-highlighted-selected'
      } else {
        return '--color-block-highlighted'
      }
    } else {
      if (lighten) {
        return '--color-block-selected'
      } else {
        return '--color-block'
      }
    }
  })

  let bulbColor = $derived.by(() => {
    if (fs.friend.status == 'accept') {
      return peerConnectionStatusToBulbColorCssVariable(fs.connectionStatus)
    } else if (
      fs.friend.status == 'friend-request:offline-and-our-friend-accept-unsent' ||
      fs.friend.status == 'friend-request:offline-and-our-friend-request-unsent'
    ) {
      return '--color-lightbulb-offline'
    } else {
      return '--color-icon'
    }
  })
  let icon = $derived.by(() => {
    switch (fs.friend.status) {
      case 'accept':
        return 'fa-lightbulb'
      case 'blocking':
        return 'fa-x'
      case 'blocked':
        return 'fa-ban'
      case 'none':
        return '' /**@todo*/
      case 'friend-request:considering-our-request':
      case 'friend-request:offline-and-our-friend-request-unsent':
        return 'fa-hourglass-half'
      case 'friend-request:awaiting-our-response':
      case 'friend-request:offline-and-our-friend-accept-unsent':
        return 'fa-envelope'
    }
  })
</script>

<a href={undefined} id="button" {onclick} {oncontextmenu}>
  <div id="block" style={`background-color: var(${backgroundColor})`}>
    {#key fs}
      <span title={fs.connectionStatus}>
        <i class="fas {icon}" id="bulb" style={`color: var(${bulbColor})`}></i>
      </span>
    {/key}
    <p id="nickname">{fs.friend.nickname}</p>
    <div id="cog-container">
      <HarmonyIcon
        icon="fa-cog"
        ariaLabel="Edit"
        onclick={(e) => {
          e.stopPropagation()
          changeFriendStatus(fs.friend, 'edit')
        }}
      />
    </div>
  </div>
</a>

<style>
  #cog-container {
    position: relative;
    right: 0px;
    flex-grow: 1;
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    margin-left: 5px;
    margin-right: 5px;
  }
  #button {
    width: 100%;
  }
  #block {
    background-color: var(--color-block);
    padding-top: 3px;
    padding-bottom: 3px;

    border-radius: 5px;
    margin-top: 1px;
    margin-bottom: 1px;
    display: flex;
    align-items: center;
    /* height: 25px; */
    max-width: 100%;
  }
  #block:hover {
    opacity: 80%;
    cursor: pointer;
  }
  #block:active {
    cursor: pointer;
  }
  #bulb {
    margin-left: 5px;
    margin-right: 5px;
    font-size: 20px;
  }
  #nickname {
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
  }
</style>
