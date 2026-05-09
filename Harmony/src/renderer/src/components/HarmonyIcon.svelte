<script lang="ts">
  let {
    onclick,
    ariaLabel,
    title,
    icon,
    color = 'var(--color-icon)',
    disabled = false
  }: {
    onclick: HTMLButtonElement['onclick']
    ariaLabel: string
    title?: string
    icon: string
    color?: string
    disabled?: boolean
  } = $props()
</script>

<button
  type="button"
  {onclick}
  {disabled}
  id="icon"
  style={`color: ${disabled ? 'var(--color-button-disabled)' : color}`}
  aria-label={ariaLabel}
  {title}
>
  <i class="fa-solid fa-lg {icon}" id="glyph"></i>
</button>

<style>
  #icon {
    all: unset;
    app-region: no-drag;
    color: var(--color-icon);
  }

  #glyph {
    transform: rotate(var(--icon-rotation));
  }

  #icon:enabled:hover {
    opacity: 50%;
    cursor: pointer;
  }
  #icon:enabled:focus-visible {
    opacity: 50%;
    cursor: pointer;
    outline: auto;
  }
  #icon:enabled:active {
    scale: 90%;
  }
</style>
