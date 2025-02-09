<script lang="ts">
  import HarmonyIcon from './HarmonyIcon.svelte'

  let { navigateBack, title }: { navigateBack: HTMLButtonElement['onclick']; title: string } =
    $props()
</script>

<div id="top-bar">
  <div id="contents">
    <div style="margin-left: 10px; margin-right:10px">
      <HarmonyIcon ariaLabel="Back" icon="fa-chevron-left" onclick={navigateBack} />
    </div>
    <h2>{title}</h2>
  </div>
</div>

<style>
  #top-bar {
    display: flex;
    flex-direction: row;
    align-items: flex-end;
    height: 100%;
    width: 100%;
  }
  #contents {
    display: flex;
    align-items: center;
  }
</style>
