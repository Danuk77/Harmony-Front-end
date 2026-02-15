<script lang="ts">
  import IconBubble from "./components/IconBubble.svelte"
  import '@fortawesome/fontawesome-free/css/all.min.css'
  import '@fortawesome/fontawesome-free/js/all.min.js'

  function hangUp() {
    alert("hang up")
  }

  function microphone() {
    alert("mincrophone")
  }

  function video() {
    alert("video")
  }

  function mute() {
    alert("mute")
  }


</script>

<div id="callWindow">
  <!-- <video id="received_video" autoplay></video> -->
  <div id="iconBand">
    <div id="iconPanel">
      <IconBubble 
      ariaLabel="Enable/disable microphone" 
      icon="fa-microphone" 
      --background-color="var(--ev-c-blue-purple-1)"
      onclick={microphone}
      />
      <IconBubble 
      ariaLabel="Enable/disable video" 
      icon="fa-video" 
      --background-color="var(--ev-c-blue-purple-1)"
      onclick={video}
      />
      <IconBubble 
      ariaLabel="Mute/unmute" 
      icon="fa-headphones" 
      --background-color="var(--ev-c-blue-purple-1)"
      onclick={mute}
      />
      <IconBubble 
        ariaLabel="Hang up" 
        icon="fa-phone" 
        --icon-rotation="135deg" 
        --background-color="var(--ev-c-pink-1)"
        onclick={hangUp}
      />
    </div>
  </div>
  <!-- <button id="hangup-button" ->Hang Up</button> -->
</div>



<style>
  #callWindow {
    background-color: var(--ev-c-purple-2);
    position: absolute;
    left: 0px;
    top:  0px;
    right:0px;
    bottom:0px;
  }

  #iconPanel{
   
    display:flex;
    justify-content: center;
    flex-direction: row;
    flex-wrap: wrap;
    gap:20px;
  }

  #iconBand{
    width: 100%;
    display: flex;
    justify-content: center;
    position: absolute;
    bottom:20px;
  }

</style>