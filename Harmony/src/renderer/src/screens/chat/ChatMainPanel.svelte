<script lang="ts">
  import { onMount, tick } from 'svelte'
  import type { Message } from '../../../../main/LocalDatabase'
  import type { MainToRenderer1WayAction } from '../../../../preload'
  import { store } from '../../redux'

  const MAX_VISIBLE_MESSAGES = 500
  const START_VISIBLE_MESSAGES = 50
  const SHIFT_VISIBLE_MESSAGES_BY = 100
  const SHIFT_VISIBLE_MESSAGES_THRESHOLD = 10

  const friendState = $derived.by(() =>
    $store.friendStates.find((fs) => fs.friend.peerPk == $store.ui.selectedFriendPk)
  )

  let messages: Message[] = $state([])

  // update messages when ui changes
  let selectedFriendPk = $derived($store.ui.selectedFriendPk)
  // ^ have to copy specific property for the $effect. Prevents firing whenever the store as a whole changes
  $effect(() => {
    messages = []
    messageViewRange = defaultMessageViewRange
    if (selectedFriendPk != null) {
      window.api.getConversation('local', selectedFriendPk).then((_messages) => {
        messages = _messages
      })
    }
  })

  // uupdate with incoming messasges
  onMount(() => {
    const bc = new BroadcastChannel('mainToRenderer1WayAction')
    bc.onmessage = (_event) => {
      const action = _event.data as MainToRenderer1WayAction
      if (action.type == 'receive-message') {
        if (action.payload.fromPk == $store.ui.selectedFriendPk && action.payload.toPk == 'local') {
          appendMessage(action.payload)
        }
      }
    }
    return () => bc.close()
  })

  function appendMessage(msg: Message) {
    messages.push(msg)
    onScrollViewport()
  }

  const defaultMessageViewRange: [number, number] = [-START_VISIBLE_MESSAGES, 0]
  let messageViewRange = $state(defaultMessageViewRange)

  let visibleMessages = $derived.by(() => {
    if (messageViewRange[1] == 0) {
      return messages.slice(messageViewRange[0])
    } else {
      return messages.slice(...messageViewRange)
    }
  })

  // group consecutive messages from the same sender
  // create new group if messages more than 5 mins apart.
  let messageGroups = $derived.by(() => {
    type group = { fromPk: string; msgs: Message[]; newDay: boolean }
    let groups: group[] = []
    let currentGroup: group | undefined
    for (const msg of visibleMessages) {
      if (!currentGroup) {
        currentGroup = {
          fromPk: msg.fromPk,
          msgs: [msg],
          newDay: true
        }
        continue
      }
      // check for new day
      if (containsDateBoundary(currentGroup.msgs[currentGroup.msgs.length - 1].date, msg.date)) {
        groups.push(currentGroup)
        currentGroup = {
          fromPk: msg.fromPk,
          msgs: [msg],
          newDay: true
        }
        // different sender or gap between last message
      } else if (
        msg.fromPk != currentGroup.fromPk ||
        msg.date > currentGroup.msgs[0].date + 300_000 /*5 mins*/
      ) {
        groups.push(currentGroup)
        currentGroup = {
          fromPk: msg.fromPk,
          msgs: [msg],
          newDay: false
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

  // scroll to the bottom when messageGroups changes, if the user is already at the bottom
  // https://svelte.dev/docs/svelte/lifecycle-hooks
  let viewport: HTMLDivElement
  $effect.pre(() => {
    messageGroups
    const autoscroll =
      viewport &&
      messageViewRange[1] == 0 &&
      viewport.offsetHeight + viewport.scrollTop > viewport.scrollHeight - 50

    if (autoscroll) {
      tick().then(() => {
        viewport.scrollTo(0, viewport.scrollHeight)
      })
    }
  })

  function tryScrollViewportUp(msgs: HTMLCollectionOf<Element>) {
    if (msgs.length < SHIFT_VISIBLE_MESSAGES_THRESHOLD) return null
    if (messageViewRange[0] <= -messages.length) return null
    const anchor = msgs[SHIFT_VISIBLE_MESSAGES_THRESHOLD]
    if (anchor.getBoundingClientRect().bottom > viewport.getBoundingClientRect().top) {
      const newStart = Math.max(-messages.length, messageViewRange[0] - SHIFT_VISIBLE_MESSAGES_BY)
      messageViewRange = [newStart, Math.min(0, newStart + MAX_VISIBLE_MESSAGES)]
      return { id: anchor.id, rect: anchor.getBoundingClientRect() }
    }
    return null
  }

  function tryScrollViewportDown(msgs: HTMLCollectionOf<Element>) {
    if (msgs.length < SHIFT_VISIBLE_MESSAGES_THRESHOLD) return null
    if (messageViewRange[1] >= -0) return null
    const anchor = msgs[msgs.length - SHIFT_VISIBLE_MESSAGES_THRESHOLD]
    if (anchor.getBoundingClientRect().top < viewport.getBoundingClientRect().bottom) {
      const newEnd = Math.min(0, messageViewRange[1] + SHIFT_VISIBLE_MESSAGES_BY)
      messageViewRange = [Math.max(-messages.length, newEnd - MAX_VISIBLE_MESSAGES), newEnd]
      return { id: anchor.id, rect: anchor.getBoundingClientRect() }
    }
    return null
  }

  const onScrollViewport = () => {
    // less than SHIFT_VISIBLE_MESSAGES_THRESHOLD messages above or below the scroll viewport? If so, load more.
    const msgs = viewport.getElementsByClassName('msg')
    const anchor = tryScrollViewportUp(msgs) ?? tryScrollViewportDown(msgs)
    if (!anchor) return

    tick().then(() => {
      // scroll the viewport so that the anchor message is in the same place on the screen as before
      const newAnchorRect = document.getElementById(anchor.id)?.getBoundingClientRect()
      if (!newAnchorRect) return
      viewport.scrollBy({
        behavior: 'instant',
        top: newAnchorRect.top - anchor.rect.top
      })
    })
  }

  // input box
  let inputEnabled = $derived(
    friendState?.connectionStatus &&
      (friendState.connectionStatus == 'encrypted-connected' ||
        friendState?.connectionStatus == 'unencrypted-connected')
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
        window.api.beep()
        return
      }
      if (textBoxContents == '') {
        window.api.beep()
        return
      }
      if (!$store.user.keyPair) {
        return
      }
      const message = textBoxContents
      window.api.sendMessage($store.ui.selectedFriendPk, message).then(({ msg: msgObj, error }) => {
        if (error) {
          const shortenedMessage = message.length > 30 ? message.slice(0, 30) + '...' : message
          window.api.showErrorBox(`Failed to send message "${shortenedMessage}"`, error)
        }
        if (msgObj) appendMessage(msgObj)
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

  const msToTimeString = (time: number) => {
    const date = new Date(time)
    return date.toLocaleTimeString([], { timeStyle: 'short' })
  }

  const msToDateString = (time: number) => {
    return new Date(time).toLocaleDateString([], { dateStyle: 'full' })
  }

  const containsDateBoundary = (date0: number, date1: number) => {
    return (
      Math.abs(date1 - date0) >= 86400000 || new Date(date0).getDate() != new Date(date1).getDate()
    )
  }
</script>

<svelte:window onkeydown={globalKeydown} on:keyup={globalKeyup} />

<div id="chat">
  {#if friendState?.connectionStatus == 'unencrypted-connected'}
    <p id="identity-warning">Caution - peer's public key couldn't be verified</p>
  {/if}
  <div id="message-scroll-container" bind:this={viewport} onscroll={onScrollViewport}>
    <div id="messages">
      {#each messageGroups as messageGroup}
        {#if messageGroup.newDay}
          <div class="date-align" style="margin-top: 10px">
            {msToDateString(messageGroup.msgs[0].date)}
          </div>
        {/if}
        {#if messageGroup.fromPk == 'local'}
          <p class="receiver-align name">
            You • {msToTimeString(messageGroup.msgs[0].date)}
          </p>
          {#each messageGroup.msgs as msg}
            <div
              class="receiver-align receiver-color bubble msg"
              id={`msg-${msg.date}-${msg.msgNumber}`}
            >
              {msg.text}
            </div>
          {/each}
        {:else}
          <p class="sender-align name">
            Peer • {msToTimeString(messageGroup.msgs[0].date)}
          </p>
          {#each messageGroup.msgs as msg}
            <div
              class="sender-align sender-color bubble msg"
              id={`msg-${msg.date}-${msg.msgNumber}`}
            >
              {msg.text}
            </div>
          {/each}
        {/if}
      {/each}
    </div>
  </div>
  {#if $store.ui.selectedFriendPk}
    <!-- <div class="bubble" id="message-input-container" style="background-color: var({inputBoxColor})"> -->
    <div
      class="bubble"
      id="message-input-container"
      style="background-color: var({inputBoxColor})"
      contenteditable="plaintext-only"
      onkeypress={messageBoxKeyEvent}
      role="textbox"
      tabindex="0"
      bind:innerText={textBoxContents}
    ></div>
    <!-- </div> -->
  {/if}
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
    user-select: text;
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
  .date-align {
    align-self: center;
  }
  .sender-color {
    background-color: var(--color-sender-bubble);
  }
  .receiver-color {
    background-color: var(--color-receiver-bubble);
  }
  #message-input-container {
    /* background color now set by inline css */
    box-shadow: inset 0px 3px 4px 0px;
    max-width: 700px;
    width: 90%;
    max-height: 50%;
    margin-bottom: 20px;
    margin-top: 20px;
    min-height: 30px;
    height: max-content;
    color: var(--color-text-black);
    overflow-y: scroll;
  }
  #identity-warning {
    background-color: var(--color-lightbulb-unverified);
    color: var(--color-text-black);
    width: 100%;
    text-align: left;
    padding-left: 13px;
    box-shadow: 1px 1px 3px black;
    z-index: 1;
  }
</style>
