//
// Fraidycat UI entry point. Preact renders the app; a signal-based store
// (store.js) holds state and talks to the background process, and a small
// hash router (router.js) drives navigation.
//
import { h, render } from 'preact'
import { App } from './view'
import { init } from './store'
import '../css/fraidy.css'

render(<App />, document.getElementById('fraidy'))
init()
