<script>
  import Chat from '../components/Chat.svelte'
  import Sidebar from '../components/Sidebar.svelte'
  import TopBar from '../components/TopBar.svelte'
</script>

<div id="overlay">
  <div id="iconAndLogo">
    <h1 id="harmonyText">Harmony</h1>
  </div>
  <div id="statusBar">
    <TopBar />
  </div>

  <div id="sidebar">
    <Sidebar />
  </div>

  <div id="main-panel">
    <Chat />
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
  #statusBar {
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
