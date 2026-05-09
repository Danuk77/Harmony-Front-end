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
  import EditKeyPairTopBar from './screens/edit-keypair/EditKeyPairTopBar.svelte'
  import EditKeyPairMainPanel from './screens/edit-keypair/EditKeyPairMainPanel.svelte'
</script>

<div id="overlay">
  <div id="row1">
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
      {:else if $store.ui.screenMode == 'edit-keypair'}
        <EditKeyPairTopBar />
      {/if}
    </div>
  </div>

  <div id="row2">
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
      {:else if $store.ui.screenMode == 'edit-keypair'}
        <EditKeyPairMainPanel />
      {/if}
    </div>
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
    /* row-gap: 5px; */
  }
  #iconAndLogo {
    background-color: var(--color-sidebar);
  }
  #top-bar {
    background-color: var(--color-sidebar);
  }
  #sidebar {
    min-height: 0;
    min-width: 0;
    background-color: var(--color-sidebar);
    box-shadow: 1px 1px 3px black;
    margin-top: 5px;
    border-radius: 0px 10px 0px 0px;
  }
  #main-panel {
    min-height: 0;
    min-width: 0;
  }

  #row1 {
    app-region: drag;
    z-index: 1;
    grid-row: 1;
    grid-column: 1 / 3;
    display: grid;
    grid-template-columns: subgrid;
    box-shadow: 1px 1px 3px black;
  }

  #row2 {
    min-height: 0;
    grid-row: 2;
    grid-column: 1 / 3;
    display: grid;
    grid-template-columns: subgrid;
    pointer-events: visible;
  }
</style>
