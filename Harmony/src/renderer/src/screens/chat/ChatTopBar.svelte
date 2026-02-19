<script lang="ts">
  import '@fortawesome/fontawesome-free/css/all.min.css'
  import '@fortawesome/fontawesome-free/js/all.min.js'
  import { peerConnectionStatusToBulbColorCssVariable } from '../../misc/misc'
  import { store } from '../../redux'
  import IconBubble from '../../components/IconBubble.svelte'

  let fs = $derived.by(() => {
    return $store.ui.selectedFriendPk
      ? $store.friendStates.find((fs) => fs.friend.peerPk == $store.ui.selectedFriendPk)
      : undefined
  })
  let bulbColor = $derived(
    fs
      ? peerConnectionStatusToBulbColorCssVariable(fs.connectionStatus)
      : '--color-lightbulb-connected'
  )
  let callButtonColor = $derived.by(() => {
    if (!fs) {
      return null
    }
    switch (fs.callStatus) {
      case 'none':
        return '--color-button-normal'
      case 'incoming-call':
        return '--color-button-highlighted'
      case 'outgoing-call':
      case 'in-call':
        return null
    }
  })
</script>

<div id="topBarHorizontalItems">
  <div id="friendDescription">
    {#if fs}
      <!-- wrap in key+span for dumb reasons involving the i tag being translated into an svg by fontawesome -->
      {#key fs}
        <span>
          <i class="fas fa-lightbulb" style="color: var({bulbColor})" id="bulb"></i>
        </span>
      {/key}
      <p id="nicknameAndPk">
        {fs.friend.nickname}<span id="pk" title={fs.friend.peerPk}>&nbsp;| {fs.friend.peerPk}</span>
      </p>
    {/if}
  </div>
  {#if fs && callButtonColor && (fs.callStatus == 'none' || fs.callStatus == 'incoming-call')}
    <div class="button">
      <IconBubble
        ariaLabel="Pick up"
        icon="fa-phone"
        --background-color={`var(${callButtonColor})`}
        onclick={() => alert('call')}
        disabled={fs.connectionStatus != 'online-connected'}
      />
    </div>
  {/if}
</div>

<style>
  #topBarHorizontalItems {
    display: flex;
    flex-direction: row;
    height: 100%;
    width: 100%;
  }
  #friendDescription {
    display: flex;
    flex-direction: row;
    align-items: flex-end;
    align-self: flex-end;
    height: 100%;
    width: 100%;
  }
  .button {
    height: 100%;
    aspect-ratio: 1 / 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  #bulb {
    margin-left: 5px;
    margin-right: 5px;
    font-size: 25px;
  }
  #nicknameAndPk {
    width: calc(100%);
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    display: inline-block;
    container-type: inline-size;
  }
  #pk {
    color: var(--color-text-gray);
  }
</style>
