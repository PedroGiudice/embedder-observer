/* @refresh reload */
import { render } from 'solid-js/web'
import '@iconify-icon/solid'
import { App } from './App'

const root = document.getElementById('root')!
render(() => <App />, root)
