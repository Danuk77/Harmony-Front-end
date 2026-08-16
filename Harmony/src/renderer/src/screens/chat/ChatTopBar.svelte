<script lang="ts">
  import '@fortawesome/fontawesome-free/css/all.min.css'
  import '@fortawesome/fontawesome-free/js/all.min.js'
  import { peerConnectionStatusToBulbColorCssVariable } from '../../misc/misc'
  import { store } from '../../redux'
  import HarmonyIcon from '../../components/HarmonyIcon.svelte'

  $effect(() => {
    console.log($store)
  })

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
  let pickUpButtonAppearence: { color: string; title: string } | null = $derived.by(() => {
    if (!fs) {
      return null
    }
    if (fs.videoCallStatus.callDirection == 'none') {
      return {
        color: '--color-button-normal',
        title:
          'Request a video call' +
          (fs.connectionStatus == 'encrypted-connected' ||
          fs.connectionStatus == 'unencrypted-connected'
            ? ''
            : ' (not available)')
      }
    }
    if (fs.videoCallStatus.callDirection == 'incoming' && !fs.videoCallStatus.accepted) {
      return { color: '--color-button-incoming', title: 'Accept incoming call' }
    }
    return null
  })

  let hangUpButtonAppearence: { color: string; title: string } | null = $derived.by(() => {
    if (!fs) {
      return null
    }
    switch (fs.videoCallStatus.call) {
      case 'failed':
      case 'none':
      case 'peer-hang-up':
        return null
      case 'signalling':
      case 'in-call':
        return { color: '--color-button-hangup', title: 'Hang up call' }
      case 'ringing':
        return { color: '--color-button-hangup', title: 'Reject call' }
    }
  })

  function requestOrAcceptVideoCall() {
    if (!$store.ui.selectedFriendPk) {
      return
    }
    if (fs?.videoCallStatus.callDirection == 'incoming') {
      window.api.weAcceptVideoCall($store.ui.selectedFriendPk)
    } else if (fs?.videoCallStatus.callDirection == 'none') {
      window.api.sendVideoCallRequest($store.ui.selectedFriendPk)
    }
  }

  function declineOrHangUpVideoCall() {
    if (!$store.ui.selectedFriendPk) {
      return
    }
    window.api.hangUpAndCloseVideoCall($store.ui.selectedFriendPk)
  }
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
  {#if fs && pickUpButtonAppearence}
    <div class="button">
      <HarmonyIcon
        onclick={requestOrAcceptVideoCall}
        icon="fa-phone"
        ariaLabel={pickUpButtonAppearence.title}
        title={pickUpButtonAppearence.title}
        color={`var(${pickUpButtonAppearence.color})`}
        disabled={!(
          fs.connectionStatus == 'encrypted-connected' ||
          fs.connectionStatus == 'unencrypted-connected'
        )}
      />
      <!-- <IconBubble
        ariaLabel="Pick up"
        icon="fa-phone"
        --background-color={`var(${pickUpButtonColor})`}
        onclick={requestOrAcceptVideoCall}
        disabled={fs.connectionStatus != 'online-connected'}
      /> -->
    </div>
  {/if}
  {#if fs && hangUpButtonAppearence}
    <div class="button">
      <HarmonyIcon
        onclick={declineOrHangUpVideoCall}
        icon="fa-phone"
        ariaLabel={hangUpButtonAppearence.title}
        title={hangUpButtonAppearence.title}
        color={`var(${hangUpButtonAppearence.color})`}
        disabled={!(
          fs.connectionStatus == 'encrypted-connected' ||
          fs.connectionStatus == 'unencrypted-connected'
        )}
        --icon-rotation="135deg"
      />

      <!-- <IconBubble
        ariaLabel="Hang up"
        icon="fa-phone"
        --background-color={`var(${hangUpButtonAppearence})`}
        onclick={declineOrHangUpVideoCall}
        disabled={fs.connectionStatus != 'online-connected'}
        --icon-rotation="135deg"
      /> -->
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
    /* height: 100%; */
    aspect-ratio: 1 / 1;
    display: flex;
    align-self: flex-end;
    align-items: center;
    justify-content: center;
    padding-right: 5px;
  }
  #bulb {
    margin-left: 5px;
    margin-right: 5px;
    font-size: 25px;
    -webkit-app-region: no-drag;
  }
  #nicknameAndPk {
    /* max-width: ; */
    width: calc(100%);
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    display: inline-block;
    container-type: inline-size;
    /* margin: 0 auto; */
  }
  #nicknameAndPk > * {
    -webkit-app-region: no-drag;
  }
  #pk {
    color: var(--color-text-gray);
  }
</style>
