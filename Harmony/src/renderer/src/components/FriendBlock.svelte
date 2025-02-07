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
    fs,
    onclick,
    oncontextmenu
  }: {
    selected: boolean
    fs: FriendState
    onclick?: HTMLButtonElement['onclick']
    oncontextmenu?: HTMLButtonElement['oncontextmenu']
  } = $props()

  let backgroundColor = $derived(
    selected && ($store.ui.screenMode == 'chat' || $store.ui.screenMode == 'edit-friend')
      ? '--color-block-selected'
      : '--color-block'
  )
  let bulbColor = $derived.by(() => {
    if (fs.friend.status == 'accept') {
      return peerConnectionStatusToBulbColorCssVariable(fs.connectionStatus)
    } else {
      return '--color-icon'
    }
  })
  let icon = $derived.by(() => {
    switch (fs.friend.status) {
      case 'reject':
        return 'fa-x'
      case 'accept':
        return 'fa-lightbulb'
      case 'pending':
        return 'fa-envelope'
      case 'block':
        return 'fa-ban'
      case 'awaiting-response':
        return 'fa-hourglass-half'
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
