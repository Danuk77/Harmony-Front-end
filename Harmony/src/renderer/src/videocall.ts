import './assets/main.css'

import VideoCall from './VideoCall.svelte'
import { mount } from 'svelte'

const app = mount(VideoCall, {
  // eslint-disable-next-line
  // @ts-ignore
  target: document.getElementById('app')
})

export default app
