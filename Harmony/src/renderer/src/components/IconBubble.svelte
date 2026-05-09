<script lang="ts">
  let {
    onclick,
    ariaLabel,
    icon,
    strikethrough,
    disabled
    // bubbleBackgroundColor,
  }: {
    onclick: HTMLButtonElement['onclick']
    ariaLabel: string
    icon: string
    strikethrough?: boolean
    disabled?: boolean
  } = $props()
</script>

<button type="button" {onclick} id="icon" aria-label={ariaLabel} disabled={!!disabled}>
  <div id="translationFix">
    <i id="glyph" class="fa-solid fa-lg {icon}"></i>
  </div>
  {#if strikethrough}
    <!-- draw diagonal line -->
    <svg height="30" width="30" style="position: relative; top:0; left:0">
      <line x1="1" y1="0" x2="30" y2="29" style="stroke:white; stroke-width:2" />
      <line x1="0" y1="1" x2="29" y2="30" style="stroke:var(--background-color); stroke-width:2" />
    </svg>
  {/if}
</button>

<style>
  #translationFix {
    position: fixed;
    transform: translateX(-0.5px);
  }

  #glyph {
    transform: rotate(var(--icon-rotation));
  }

  #icon {
    all: unset;
    app-region: no-drag;
    width: 30px;
    height: 30px;
    border-radius: 30px;
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: var(--background-color);
    overflow: hidden;
    box-shadow: var(--light-box-shadow);
  }

  #icon #glyph {
    color: var(--color-button-text-enabled);
  }

  #icon:disabled {
    background-color: var(--color-button-disabled);
  }

  #icon:disabled #glyph {
    color: var(--color-button-text-disabled);
  }

  #icon:hover:enabled {
    opacity: 50%;
    cursor: pointer;
  }

  #icon:focus-visible:enabled {
    opacity: 50%;
    cursor: pointer;
    outline: auto;
  }
  #icon:active:enabled {
    scale: 90%;
  }
</style>
