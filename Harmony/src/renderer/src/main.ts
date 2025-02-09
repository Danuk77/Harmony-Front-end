import './assets/main.css'

import App from './App.svelte'
import { mount } from 'svelte'

const app = mount(App, {
  // eslint-disable-next-line
  // @ts-ignore
  target: document.getElementById('app')
})

export default app
