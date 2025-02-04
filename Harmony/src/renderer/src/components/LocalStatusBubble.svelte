<script lang="ts">
  import '@fortawesome/fontawesome-free/css/all.min.css'
  import '@fortawesome/fontawesome-free/js/all.min.js'
  import { store } from '../redux'

  let backgroundColor = $derived(
    $store.ui.screenMode == 'user-settings'
      ? '--color-local-status-bubble-selected'
      : '--color-local-status-bubble'
  )
  let bulbColor = $derived(
    $store.connection.state == 'logged-in'
      ? '--color-lightbulb-connected'
      : '--color-lightbulb-offline'
  )

  let onclick: HTMLButtonElement['onclick'] = () => {
    store.dispatch({ type: 'set-screen-mode', payload: 'user-settings' })
  }
</script>

<button type="button" id="button" {onclick}>
  <div id="block" style={`background-color: var(${backgroundColor})`}>
    {#key $store.connection.state}
      <span title={$store.connection.state}>
        <i class="fas fa-lightbulb" id="bulb" style={`color: var(${bulbColor})`}></i>
      </span>
    {/key}
    <p id="nickname">User settings</p>
  </div>
</button>

<style>
  #button {
    all: unset;
    width: 50%;
  }
  #block {
    background-color: var(--color-block);
    padding-top: 3px;
    padding-bottom: 3px;

    border-radius: 20px;
    margin-top: 1px;
    margin-bottom: 20px;
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
  /* #bulb {
    margin-left: 5px;
    margin-right: 5px;
    font-size: 25px;
  } */
  #nickname {
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    flex-grow: 1;
    text-align: center;
  }
</style>
