<script lang="ts">
  import '@fortawesome/fontawesome-free/css/all.min.css'
  import '@fortawesome/fontawesome-free/js/all.min.js'
  import { connectionStatusToBulbColorCssVariable } from '../../misc/misc'
  import { store } from '../../redux'

  let fs = $derived.by(() => {
    return $store.ui.selectedFriendPk
      ? $store.friendStates.find((fs) => fs.friend.peerPk == $store.ui.selectedFriendPk)
      : undefined
  })
  let bulbColor = $derived(
    fs ? connectionStatusToBulbColorCssVariable(fs.connectionStatus) : '--color-lightbulb-connected'
  )
</script>

<div id="friendDescription">
  {#if fs}
    <!-- wrap in key+span for dumb reasons involving the i tag being translated into an svg by fontawesome -->
    {#key fs}
      <span>
        <i class="fas fa-lightbulb" style="color: var({bulbColor})" id="bulb"></i>
      </span>
    {/key}
    <p id="nicknameAndPk">{fs.friend.nickname}<span id="pk">&nbsp;| {fs.friend.peerPk}</span></p>
  {/if}
</div>

<style>
  #friendDescription {
    display: flex;
    flex-direction: row;
    align-items: flex-end;
    height: 100%;
    width: 100%;
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
