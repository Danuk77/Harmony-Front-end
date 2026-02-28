<script lang="ts">
  import '@fortawesome/fontawesome-free/css/all.min.css'
  import '@fortawesome/fontawesome-free/js/all.min.js'
  import { peerConnectionStatusToBulbColorCssVariable } from '../misc/misc'
  import type { FriendState } from '../../../common/redux'
  import { store } from '../redux'
  import { changeFriendStatus } from '../endpointIoWrappers'
  let {
    selected,
    hasUnreadMessages,
    hasIncomingCall,
    fs,
    onclick,
    oncontextmenu
  }: {
    selected: boolean
    hasUnreadMessages: boolean
    hasIncomingCall: boolean
    fs: FriendState
    onclick?: () => unknown
    oncontextmenu?: HTMLButtonElement['oncontextmenu']
  } = $props()

  const getButtonBackgroundColor = (amber: boolean, lighten: boolean) => {
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
  }

  let statusAndNameBackgroundColor = $derived.by(() => {
    const lighten = selected && $store.ui.screenMode == 'chat'
    const amber = hasUnreadMessages || hasIncomingCall

    return getButtonBackgroundColor(amber, lighten)
  })

  let editBackgroundColor = $derived.by(() => {
    const lighten = selected && $store.ui.screenMode == 'edit-friend'
    const amber = hasUnreadMessages || hasIncomingCall

    return getButtonBackgroundColor(amber, lighten)
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
    if (hasIncomingCall) {
      return 'fa-phone-volume'
    }

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

<div id="block">
  <button
    id="status-and-name"
    style={`background-color: var(${statusAndNameBackgroundColor})`}
    {onclick}
    {oncontextmenu}
    aria-label={fs.friend.nickname}
  >
    {#key fs}
      <span title={fs.connectionStatus} id="status-span">
        <i class="fas {icon}" id="bulb" style={`color: var(${bulbColor})`}></i>
      </span>
    {/key}
    <p id="nickname">{fs.friend.nickname}</p>
  </button>
  <button
    id="cog-container"
    style={`background-color: var(${editBackgroundColor})`}
    onclick={() => changeFriendStatus(fs.friend, 'edit')}
    aria-label="Edit"
    {oncontextmenu}
  >
    <i class="fas fa-cog fa-lg" id="cog"></i>
  </button>
</div>

<style>
  button {
    all: unset;
  }
  button:focus-visible {
    outline: auto;
  }
  #status-and-name {
    height: 100%;
    display: flex;
    flex-direction: row;
    align-items: center;

    flex-shrink: 1;
    flex-grow: 1;
    min-width: 0px;
    padding-right: 2px;
    border-radius: 5px 0 0 5px;
    box-shadow: var(--dark-box-shadow);
  }
  button:hover {
    opacity: 80%;
    cursor: pointer;
  }
  button:active {
    cursor: pointer;
    opacity: 60%;
  }
  #status-span {
    flex-shrink: 0;
    height: max-content;
    display: flex;
    flex-direction: row;
    align-items: center;
  }
  #nickname {
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    flex-shrink: 1;
    flex-grow: 1;
    flex-basis: auto;
  }
  #cog-container {
    /* background-color: var(--color-block); */
    position: relative;
    height: 100%;
    right: 0px;
    flex-shrink: 0;
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    align-items: center;
    padding-left: 5px;
    margin-left: 2px;
    padding-right: 5px;
    border-radius: 0 5px 5px 0;
    box-shadow: var(--dark-box-shadow);
  }
  #bulb {
    margin-left: 5px;
    margin-right: 5px;
    font-size: 20px;
  }

  #block {
    margin-top: 1px;
    margin-bottom: 1px;
    display: flex;
    align-items: center;
    /* height: 25px; */
    width: 100%;
    justify-content: space-between;
    /* overflow: hidden; */
    height: 30px;
  }
</style>
