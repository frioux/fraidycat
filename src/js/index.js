//
// Fraidycat UI entry point. Preact renders the app; a signal-based store
// (store.js) holds state and talks to the background process, and a small
// hash router (router.js) drives navigation.
//
// The UI runs as a content script on https://fraidyc.at/s/, i.e. in Chrome's
// isolated world, where `window.customElements` is `null`. emoji-picker-element
// (a Web Component, imported by view.js) touches `customElements` at module
// load and would crash the whole app before it renders. Installing the custom
// elements polyfill first gives the isolated world a working registry. This
// import MUST come before view.js so it runs before emoji-picker-element's.
import '@webcomponents/custom-elements'
import { h, render } from 'preact'
import { App } from './view'
import { init } from './store'
import '../css/fraidy.css'

render(<App />, document.getElementById('fraidy'))
init()
