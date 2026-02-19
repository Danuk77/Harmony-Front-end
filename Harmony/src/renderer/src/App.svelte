<script lang="ts">
  import MainScreen from './Layout.svelte'

  // const ipcHandle = (): void => window.electron.ipcRenderer.send('ping')

  const bc = new BroadcastChannel('mainToRenderer1WayAction')

  window.api.onMainToRenderer1WayAction((action) => {
    console.log(action)
    bc.postMessage(action)
  })
</script>

<MainScreen />

<!-- <img alt="logo" class="logo" src={electronLogo} />
<div class="creator">Powered by electron-vite</div>
<div class="text">
  Build an Electron app with
  <span class="svelte">Svelte</span>
  and
  <span class="ts">TypeScript</span>
</div>
<p class="tip">Please try pressing <code>F12</code> to open the devTool</p>
<div class="actions">
  <div class="action">
    <a href="https://electron-vite.org/" target="_blank" rel="noreferrer">Documentation</a>
  </div>
  <div class="action">
    svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions a11y-missing-attribute
    <a target="_blank" rel="noreferrer" on:click={ipcHandle}>Send IPC</a>
  </div>
</div>
<Versions /> -->
