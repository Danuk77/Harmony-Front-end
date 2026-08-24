<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    children: Snippet
  }
  const { children }: Props = $props()
</script>

<div id="container">
  <div id="scroll-container">
    <div id="form">
      {@render children?.()}
    </div>
  </div>
</div>

<style>
  #container {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    overflow: hidden;
  }
  #scroll-container {
    width: 100%;
    overflow-y: scroll;
    align-items: center;
    display: flex;
    flex-direction: column;
    flex-grow: 1;
  }
  #form {
    /* margin-top: auto; bottom-justifys content */
    margin-top: 20px;
    margin-bottom: 20px;
    width: 90%;
    max-width: 700px;
    display: flex;
    flex-direction: column;
  }
</style>
