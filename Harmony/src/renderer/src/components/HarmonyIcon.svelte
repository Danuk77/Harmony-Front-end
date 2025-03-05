<script lang="ts">
  let {
    onclick,
    ariaLabel,
    icon
  }: { onclick: HTMLButtonElement['onclick']; ariaLabel: string; icon: string } = $props()
</script>

<button type="button" {onclick} id="icon" aria-label={ariaLabel}>
  <i class="fa-solid fa-lg {icon}"></i>
</button>

<style>
  #icon {
    all: unset;
    color: var(--color-icon);
  }
  #icon:hover {
    opacity: 50%;
    cursor: pointer;
  }
  #icon:focus-visible {
    opacity: 50%;
    cursor: pointer;
    outline: auto;
  }
  #icon:active {
    scale: 90%;
  }
</style>
