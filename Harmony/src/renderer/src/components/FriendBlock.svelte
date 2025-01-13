<script lang="ts">
  import type { FriendWithState } from '../../../preload'
  import '@fortawesome/fontawesome-free/css/all.min.css'
  import '@fortawesome/fontawesome-free/js/all.min.js'
  import { connectionStatusToBulbColorCssVariable } from '../misc/misc'
  let {
    selected,
    friend,
    onclick
  }: { selected: boolean; friend: FriendWithState; onclick: () => unknown } = $props()

  let backgroundColor = $derived(selected ? '--color-block-selected' : '--color-block')
  let bulbColor = $derived(connectionStatusToBulbColorCssVariable(friend.connectionStatus))
</script>

<button type="button" id="button" {onclick}>
  <div id="block" style={`background-color: var(${backgroundColor})`}>
    <i class="fas fa-lightbulb" id="bulb" style={`color: var(${bulbColor})`}></i>
    <p id="nickname">{friend.nickname}</p>
  </div>
</button>

<style>
  #button {
    all: unset;
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
    font-size: 25px;
  }
  #nickname {
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
  }
</style>
