<script lang="ts">
  import { onMount, tick } from 'svelte'
  import type { Message } from '../../../main/LocalDatabase'
  import type { MainToRendererAction } from '../../../preload'
  import { store } from '../redux'

  const friendState = $derived.by(() =>
    $store.friendStates.find((fs) => fs.friend.peerPk == $store.ui.selectedFriendPk)
  )

  let messages: Message[] = $state([])

  // update messages when ui changes
  $effect(() => {
    if ($store.ui.selectedFriendPk != null && $store.connection.pk != null) {
      window.api
        .getConversation($store.connection.pk, $store.ui.selectedFriendPk)
        .then((_messages) => (messages = _messages))
    }
  })

  // uupdate with incoming messasges
  onMount(() => {
    const bc = new BroadcastChannel('mainToRendererAction')
    bc.onmessage = (_event) => {
      const action = _event.data as MainToRendererAction
      if (action.type == 'receive-message') {
        if (
          action.payload.fromPk == $store.ui.selectedFriendPk &&
          action.payload.toPk == $store.connection.pk
        ) {
          messages.push(action.payload)
        }
      }
    }
    return () => bc.close()
  })

  // group consecutive messages from the same sender
  let messageGroups = $derived.by(() => {
    type group = { fromPk: string; msgs: Message[] }
    let groups: group[] = []
    let currentGroup: group | undefined
    for (const msg of messages) {
      if (!currentGroup) {
        currentGroup = {
          fromPk: msg.fromPk,
          msgs: [msg]
        }
        continue
      }
      if (msg.fromPk != currentGroup.fromPk) {
        groups.push(currentGroup)
        currentGroup = {
          fromPk: msg.fromPk,
          msgs: [msg]
        }
      } else {
        currentGroup.msgs.push(msg)
      }
    }
    if (currentGroup) {
      groups.push(currentGroup)
    }
    return groups
  })

  // scroll to the bottom
  // https://svelte.dev/docs/svelte/lifecycle-hooks
  let viewport: HTMLDivElement
  $effect.pre(() => {
    messageGroups
    const autoscroll =
      viewport && viewport.offsetHeight + viewport.scrollTop > viewport.scrollHeight - 50

    if (autoscroll) {
      tick().then(() => {
        viewport.scrollTo(0, viewport.scrollHeight)
      })
    }
  })

  // input box
  let inputEnabled = $derived(
    friendState?.connectionStatus && friendState.connectionStatus == 'online-connected'
  )
  let textBoxContents = $state('')
  let isShiftHeld = false
  function globalKeydown(event: KeyboardEvent) {
    if (event.key == 'Shift') {
      isShiftHeld = true
    }
  }
  function globalKeyup(event: KeyboardEvent) {
    if (event.key == 'Shift') {
      isShiftHeld = false
    }
  }
  function messageBoxKeyEvent(event: KeyboardEvent) {
    if (event.key == 'Enter' && !isShiftHeld && $store.ui.selectedFriendPk) {
      event.preventDefault()
      if (!inputEnabled) {
        return
      }
      if (textBoxContents == '') {
        return
      }
      if (!$store.connection.pk) {
        return
      }
      window.api
        .sendMessage($store.connection.pk, $store.ui.selectedFriendPk, textBoxContents)
        .then(({ msg, error }) => {
          if (!error && msg) messages.push(msg)
        })
      textBoxContents = ''
    }
  }
  let inputBoxColor = $derived.by(() => {
    if (inputEnabled) {
      return '--color-input-box'
    } else {
      return '--color-input-box-disabled'
    }
  })
</script>

<svelte:window onkeydown={globalKeydown} on:keyup={globalKeyup} />

<div id="chat">
  <div id="message-scroll-container" bind:this={viewport}>
    <div id="messages">
      {#each messageGroups as messageGroup}
        {#if messageGroup.fromPk == $store.connection.pk}
          <p class="receiver-align name">You</p>
          {#each messageGroup.msgs as msg}
            <div class="receiver-align receiver-color bubble">
              {msg.text}
            </div>
          {/each}
        {:else}
          <p class="sender-align name">Peer</p>
          {#each messageGroup.msgs as msg}
            <div class="sender-align sender-color bubble">
              {msg.text}
            </div>
          {/each}
        {/if}
      {/each}
    </div>
  </div>
  <div class="bubble" id="message-input-container" style="background-color: var({inputBoxColor})">
    <div
      contenteditable="true"
      id="message-input"
      onkeypress={messageBoxKeyEvent}
      role="textbox"
      tabindex="0"
      bind:innerText={textBoxContents}
    ></div>
  </div>
</div>

<style>
  #chat {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    overflow: hidden;
  }
  #message-scroll-container {
    width: 100%;
    overflow-y: scroll;
    align-items: center;
    display: flex;
    flex-direction: column;
    flex: 1;
  }
  #messages {
    margin-top: auto; /*bottom-justifys content*/
    width: 90%;
    max-width: 700px;
    display: flex;
    flex-direction: column;
  }
  .bubble {
    border-radius: 18px;
    padding: 4px;
    padding-left: 8px;
    padding-right: 8px;
    margin-bottom: 2px;
    word-break: break-word;
    white-space: break-spaces;
  }
  .name {
    margin-top: 4px;
  }
  .sender-align {
    align-self: flex-start;
  }
  .receiver-align {
    align-self: flex-end;
  }
  .sender-color {
    background-color: var(--color-sender-bubble);
  }
  .receiver-color {
    background-color: var(--color-receiver-bubble);
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
