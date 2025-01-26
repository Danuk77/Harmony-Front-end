<div class="bubble" id="message-input-container">
  <div
    contenteditable="true"
    id="message-input"
    on:keypress
    role="textbox"
    tabindex="0"
    bind:innerText
  ></div>
</div>

<style>
  .bubble {
    border-radius: 18px;
    padding: 4px;
    padding-left: 8px;
    padding-right: 8px;
    margin-bottom: 2px;
    word-break: break-word;
    white-space: pre;
  }
  #message-input-container {
    /* background color now set by inline css */
    max-width: 700px;
    width: 90%;
    max-height: 50%;
    margin-bottom: 20px;
    margin-top: 20px;
    min-height: 30px;
    height: max-content;
  }
  #message-input {
    height: 100%;
    color: var(--color-text-black);
    white-space: normal;
    overflow-y: scroll;
  }
  #message-input:focus {
    outline: none;
  }
</style>
