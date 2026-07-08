//
// Fraidycat uses Hyperapp V1, with a small module system (in hyperload.js)
// and a forked router (@kickscondor/router).
//
import { h, app } from 'hyperapp'
import { hyperload } from './hyperload'

import follows from './follows'
import views from './view'
import '../css/fraidy.css'

const {state, actions, view} = hyperload({
  modules: {follows},
  view: views
})

const {initialize} = app(state, actions, view, document.getElementById('fraidy'))
initialize()

// In the dev harness, Hyperapp mounts its view once, so Parcel's default
// hot-swap leaves the running app calling stale handlers. Force a full page
// reload on any change instead. (module.hot is undefined in production builds,
// so this is stripped from the extension bundle.)
if (typeof module !== 'undefined' && module.hot) {
  module.hot.decline()
}
