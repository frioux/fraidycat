//
// src/js/router.js
//
// A minimal hash router, replacing @kickscondor/router. The app is hash-only
// (routes live after a `#!` prefix) with eight routes, so this is deliberately
// small. `location` is a signal, so any component that reads it re-renders on
// navigation.
//
import { h } from 'preact'
import { signal } from '@preact/signals'
const { parseHash, matchPath } = require('./router-match')

export { matchPath }

export const location = signal(parseHash(window.location.hash))

window.addEventListener('hashchange', () => { location.value = parseHash(window.location.hash) })

export function route(to) {
  window.location.hash = '#!' + to
}

//
// <Route path render /> - renders `render({match, location})` when the path
// matches, else nothing.
//
// Routed screens are instantiated as real components (h(render, props)) rather
// than called as functions, so each keeps isolated hook state across renders.
export const Route = ({ path, render }) => {
  let loc = location.value
  let match = matchPath(path, loc)
  return match ? h(render, { match, location: loc }) : null
}

//
// <Switch> - renders the first child <Route> whose path matches. A child with
// no `path` (the catch-all) always matches, so place it last.
//
export const Switch = ({ children }) => {
  let loc = location.value
  for (let child of [].concat(children).filter(Boolean)) {
    let match = matchPath(child.props.path, loc)
    if (match) return h(child.props.render, { match, location: loc })
  }
  return null
}

//
// <Link to class ...> - an <a> that navigates. Absolute targets get the `#!`
// hash prefix; anything else (external URLs) passes through untouched.
//
export const Link = ({ to, children, onclick, ...rest }) => {
  let href = (to && to.startsWith('/') ? '#!' : '') + to
  return <a href={href} onclick={onclick} {...rest}>{children}</a>
}
