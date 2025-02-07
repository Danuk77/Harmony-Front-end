<script>
  import ChatMainPanel from './screens/chat/ChatMainPanel.svelte'
  import AddFriendMainPanel from './screens/add-friend/AddFriendMainPanel.svelte'
  import Sidebar from './components/Sidebar.svelte'
  import { store } from './redux'
  import ChatTopBar from './screens/chat/ChatTopBar.svelte'
  import AddFriendTopBar from './screens/add-friend/AddFriendTopBar.svelte'
  import UserSettingsTopBar from './screens/user-settings/UserSettingsTopBar.svelte'
  import UserSettingsMainPanel from './screens/user-settings/UserSettingsMainPanel.svelte'
  import ServerStatusBubble from './components/ServerStatusBubble.svelte'
  import ServerSettingsTopBar from './screens/server-settings/ServerSettingsTopBar.svelte'
  import ServerSettingsMainPanel from './screens/server-settings/ServerSettingsMainPanel.svelte'
  import EditFriendMainPanel from './screens/edit-friend/EditFriendMainPanel.svelte'
  import EditFriendTopBar from './screens/edit-friend/EditFriendTopBar.svelte'
</script>

<div id="overlay">
  <div id="iconAndLogo">
    <ServerStatusBubble />
  </div>
  <div id="top-bar">
    {#if $store.ui.screenMode == 'chat'}
      <ChatTopBar />
    {:else if $store.ui.screenMode == 'add-friend'}
      <AddFriendTopBar />
    {:else if $store.ui.screenMode == 'user-settings'}
      <UserSettingsTopBar />
    {:else if $store.ui.screenMode == 'server-settings'}
      <ServerSettingsTopBar />
    {:else if $store.ui.screenMode == 'edit-friend'}
      <EditFriendTopBar />
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
    {:else if $store.ui.screenMode == 'server-settings'}
      <ServerSettingsMainPanel />
    {:else if $store.ui.screenMode == 'edit-friend'}
      <EditFriendMainPanel />
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
    row-gap: 3px;
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
