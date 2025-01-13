<script lang="ts">
  import type { Message } from '../../../main/LocalDatabase'
  import { ui } from '../state.svelte'

  const localPk = 'us' as string

  let messages: Message[] = $state([])

  // update messages when ui changes
  $effect(() => {
    if (ui.selectedFriendPk != null) {
      window.api
        .getConversation('us', ui.selectedFriendPk)
        .then((_messages) => (messages = _messages))
    }
  })

  // let messages: Message[] = [
  //   {
  //     date: new Date(time - 10000),
  //     fromPk: 'them',
  //     toPk: 'us',
  //     text: 'Short message!'
  //   },
  //   {
  //     date: new Date(time - 10000),
  //     fromPk: 'them',
  //     toPk: 'us',
  //     text: 'Short message!'
  //   },
  //   {
  //     date: new Date(time - 9000),
  //     fromPk: 'them',
  //     toPk: 'us',
  //     text: 'Another short message!'
  //   },
  //   {
  //     date: new Date(time - 8000),
  //     fromPk: 'them',
  //     toPk: 'us',
  //     text: 'Long message! Bing chilling bing chilling bing chilling bing chilling bing chilling bing chilling bing chilling bing chilling bing chilling bing chilling bing chilling bing chilling bing chilling bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbingchil'
  //   },
  //   {
  //     date: new Date(time - 7000),
  //     fromPk: 'us',
  //     toPk: 'them',
  //     text: 'I am going to infect your computer with a virus using XSS'
  //   },
  //   {
  //     date: new Date(time - 6000),
  //     fromPk: 'us',
  //     toPk: 'them',
  //     // eslint doesn't like that I'm excaping a forward slash (which is required to prevent an error)
  //     // eslint-disable-next-line
  //     text: '<script>delete("system 32")<\/script>'
  //   },
  //   {
  //     date: new Date(time - 5000),
  //     fromPk: 'them',
  //     toPk: 'us',
  //     text: 'Ah but all these inputs are sanitized u silly. Youre a silly boy'
  //   }
  // ]

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
</script>

<div id="chat">
  <div id="message-scroll-container">
    <div id="messages">
      {#each messageGroups as messageGroup}
        {#if messageGroup.fromPk == localPk}
          <p class="sender-align name">Peer</p>
          {#each messageGroup.msgs as msg}
            <div class="sender-align sender-color bubble">
              {msg.text}
            </div>
          {/each}
        {:else}
          <p class="receiver-align name">You</p>
          {#each messageGroup.msgs as msg}
            <div class="receiver-align receiver-color bubble">
              {msg.text}
            </div>
          {/each}
        {/if}
      {/each}
    </div>
  </div>
  <div class="bubble" id="message-input-container">
    <div contenteditable="true" id="message-input"></div>
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
    flex-grow: 1;
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
    background-color: var(--color-input-box);
    max-width: 700px;
    width: 90%;
    margin-bottom: 20px;
    margin-top: 20px;
    min-height: 30px;
  }
  #message-input {
    color: var(--color-text-black);
    border: none;
    resize: none;
    text-wrap: start;
  }
</style>
