<script lang="ts">
  let {
    value = $bindable(),
    label = undefined,
    error = undefined,
    bottomMargin = true,
    readonly = false
  }: {
    value?: string
    label?: string
    error?: string
    bottomMargin?: boolean
    readonly?: boolean
  } = $props()

  let textarea: HTMLTextAreaElement

  $effect(() => {
    textarea.style.height = textarea.scrollHeight + 'px'
    textarea.style.overflowY = 'hidden'
    const listener = () => {
      textarea.style.height = 'auto'
      textarea.style.height = textarea.scrollHeight + 'px'
    }
    textarea.addEventListener('input', listener)
    return () => textarea.removeEventListener('input', listener)
  })
</script>

{#if label}
  <label for="message-input">{label}</label>
{/if}
{#if error}
  <label for="message-input" id="error">{error}</label>
{/if}
<textarea
  bind:value
  id="message-input"
  style={(bottomMargin ? '' : 'margin-bottom:0px;') +
    (readonly ? 'background-color: var(--color-input-box-disabled)' : '')}
  rows="1"
  bind:this={textarea}
  {readonly}
></textarea>

<style>
  #message-input {
    font-family: inherit;
    font-size: inherit;
    border-radius: 18px;
    background-color: var(--color-input-box);
    margin-bottom: 10px;
    /* margin-top: 20px; */
    width: 100%;
    padding: 7px;
    color: var(--color-text-black);
    white-space: normal;
    resize: none;
  }

  #message-input:focus {
    outline: none;
  }
  #error {
    color: var(--color-text-error);
  }
</style>
