<script lang="ts">
  let {
    onclick,
    ariaLabel,
    icon,
    // bubbleBackgroundColor,
  }: { onclick: HTMLButtonElement['onclick']; ariaLabel: string; icon: string, } = $props()
</script>


<button type="button" {onclick} id="icon" aria-label={ariaLabel}>
    <div id="translationFix">
        
        <i id="glyph" class="fa-solid fa-lg {icon}"></i>
    </div>
</button>

<style>

    #translationFix {
        transform: translateX(-0.5px);
    }

    #glyph {
        transform: rotate(var(--icon-rotation));
    }

    #icon {
        all: unset;
        width:30px;
        height:30px;
        border-radius: 30px;
        display: flex;
        justify-content: center;
        align-items: center;
        background-color: var(--background-color);
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