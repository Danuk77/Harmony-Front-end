<script lang="ts">
  import '@fortawesome/fontawesome-free/css/all.min.css'
  import '@fortawesome/fontawesome-free/js/all.min.js'
  import { serverConnectionStatusToBulbColorCssVariable } from '../misc/misc'
  import { store } from '../redux'

  let backgroundColor = $derived(
    $store.ui.screenMode == 'server-settings' ? '--color-block-selected' : '--color-block'
  )
  let bulbColor = $derived(serverConnectionStatusToBulbColorCssVariable($store.connection.state))

  const onkeyup: HTMLAnchorElement['onkeyup'] = (event) => {
    if (event.key == ' ' || event.key == 'Enter') {
      onclick()
    }
  }

  const onclick = () => {
    store.dispatch({ type: 'set-screen-mode', payload: 'server-settings' })
  }
</script>

<div id="container">
  <a
    href={undefined}
    tabindex="0"
    id="button"
    {onclick}
    {onkeyup}
    style={`background-color: var(${backgroundColor})`}
  >
    {#key $store.connection.state}
      <span title={$store.connection.state}>
        <i class="fas fa-plug" id="bulb" style={`color: var(${bulbColor})`}></i>
      </span>
    {/key}
    <p id="nickname">{$store.user.serverUrl}</p>
  </a>
  <div id="scrollbar-placeholder"></div>
</div>

<style>
  #container {
    display: flex;
  }
  #scrollbar-placeholder {
    width: var(--scrollbar-width);
  }
  #button {
    width: 85%;

    background-color: var(--color-block);
    padding-top: 3px;
    padding-bottom: 3px;

    border-radius: 20px;
    margin-top: 10px;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    /* height: 25px; */
    max-width: 90%;
    margin-left: auto;
    margin-right: auto;
    box-shadow: var(--dark-box-shadow);
  }

  #button:focus-visible {
    opacity: 80%;
    outline: auto;
  }
  #button:hover {
    opacity: 80%;
    cursor: pointer;
  }
  #button:active {
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
