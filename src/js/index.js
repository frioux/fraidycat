//
// Fraidycat UI entry point. Preact renders the app; a signal-based store
// (store.js) holds state and talks to the background process, and a small
// hash router (router.js) drives navigation.
//
// This loads as the extension's own bundled page (index.html), so it runs
// in a normal window with native `window.customElements` - no polyfill is
// needed for emoji-picker-element (a Web Component imported by view.js).
//
import { h, render } from 'preact'
import { App } from './view'
import { init } from './store'
import '../css/fraidy.css'

render(<App />, document.getElementById('fraidy'))
init()
