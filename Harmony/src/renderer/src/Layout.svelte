<script>
  import ChatMainPanel from './screens/chat/ChatMainPanel.svelte'
  import AddFriendMainPanel from './screens/add-friend/AddFriendMainPanel.svelte'
  import Sidebar from './components/Sidebar.svelte'
  import { store } from './redux'
  import ChatTopBar from './screens/chat/ChatTopBar.svelte'
  import AddFriendTopBar from './screens/add-friend/AddFriendTopBar.svelte'
  import UserSettingsTopBar from './screens/user-settings/UserSettingsTopBar.svelte'
  import UserSettingsMainPanel from './screens/user-settings/UserSettingsMainPanel.svelte'
</script>

<div id="overlay">
  <div id="iconAndLogo">
    <h1 id="harmonyText">Harmony</h1>
    <p>{$store.connection.state}</p>
  </div>
  <div id="top-bar">
    {#if $store.ui.screenMode == 'chat'}
      <ChatTopBar />
    {:else if $store.ui.screenMode == 'add-friend'}
      <AddFriendTopBar />
    {:else if $store.ui.screenMode == 'user-settings'}
      <UserSettingsTopBar />
    {/if}
  </div>

  <div id="sidebar">
    <Sidebar />
  </div>

  <div id="main-panel">
    {#if $store.ui.screenMode == 'chat'}
      <ChatMainPanel />
    {:else if $store.ui.screenMode == 'add-friend'}
      <AddFriendMainPanel />
    {:else if $store.ui.screenMode == 'user-settings'}
      <UserSettingsMainPanel />
    {/if}
  </div>
</div>

<style>
  #overlay {
    display: grid;
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    right: 0;
    grid-template-columns: 250px auto;
    grid-template-rows: min-content auto;
    row-gap: 2px;
  }
  #iconAndLogo {
    grid-row: 1;
    grid-column: 1;
    background-color: var(--color-sidebar);
  }
  #top-bar {
    grid-row: 1;
    grid-column: 2;
    background-color: var(--color-sidebar);
  }
  #sidebar {
    grid-column: 1;
    grid-row: 2;
    min-height: 0;
    min-width: 0;
    background-color: var(--color-sidebar);
  }
  #main-panel {
    grid-column: 2;
    grid-row: 2;
    min-height: 0;
    min-width: 0;
  }
</style>
