<!-- Wrapper around anchor tag for settings option -->

<script lang="ts">
  import type { Snippet } from 'svelte'

  const { onclick, children }: { onclick?: () => unknown; children?: Snippet } = $props()

  const keyPress: HTMLAnchorElement['onkeyup'] = (event) => {
    if (event.key == ' ' || event.key == 'Enter') {
      onclick?.()
    }
  }
</script>

<a href={undefined} class="option" tabindex="0" {onclick} onkeyup={keyPress}>
  {@render children?.()}
</a>

<style>
  .option {
    font-weight: bolder;
  }
  .option:hover {
    opacity: 0.8;
    cursor: pointer;
  }
</style>
