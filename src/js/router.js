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

function read() {
  let raw = window.location.hash.startsWith('#!') ? window.location.hash.slice(2) : ''
  raw = raw || '/'
  let search = '', qi = raw.indexOf('?')
  if (qi >= 0) {
    search = raw.slice(qi + 1)
    raw = raw.slice(0, qi)
  }
  return { pathname: raw, search, hashRouting: true }
}

export const location = signal(read())

window.addEventListener('hashchange', () => { location.value = read() })

export function route(to) {
  window.location.hash = '#!' + to
}

function decode(s) {
  try { return decodeURIComponent(s) } catch { return s }
}

function parseQuery(search) {
  let out = {}
  if (search) {
    for (let pair of search.split('&')) {
      let i = pair.indexOf('=')
      let k = i < 0 ? pair : pair.slice(0, i)
      let v = i < 0 ? undefined : pair.slice(i + 1)
      if (k) out[decode(k)] = v === undefined ? undefined : decode(v)
    }
  }
  return out
}

const stripTrailing = s => s.replace(/\/+$/, '')

//
// Match a route pattern (e.g. "/tag/:tag") against the current location.
// Returns { isExact, path, params } or null. `params` merges query-string
// values with any :named path segments.
//
export function matchPath(pattern, loc) {
  let params = parseQuery(loc.search)
  if (!pattern || pattern === loc.pathname)
    return { isExact: pattern === loc.pathname, path: loc.pathname, params }

  let pat = stripTrailing(pattern).split('/')
  let seg = stripTrailing(loc.pathname).split('/')
  if (pat.length > seg.length) return null
  for (let i = 0; i < pat.length; i++) {
    if (pat[i][0] === ':') params[pat[i].slice(1)] = decode(seg[i])
    else if (pat[i] !== seg[i]) return null
  }
  return { isExact: false, path: loc.pathname, params }
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
