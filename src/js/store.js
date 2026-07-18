//
// src/js/store.js
//
// Replaces the Hyperapp state container and the follows module. A single
// signal holds the follows state; the background process pushes JSON-patch
// messages that we apply here (triggering a re-render), and the UI calls the
// exported action functions, which are thin RPCs to the background.
//
// Everything below the `local` boundary (feed fetching, sync, scraping) is
// unchanged - this module just talks to it via `client`/`command`.
//
import { signal } from '@preact/signals'
import { followTitle } from './util'
import { route } from './router'
const { reduce } = require('./messages')
const storage = require('./storage-platform')
const { alert, confirm } = require('./dialogs')

export const store = signal({ all: {}, started: false, settings: {}, updating: {} })

let local = null

function merge(partial) {
  store.value = { ...store.value, ...partial }
}

//
// Receive an update from the background process. Interactive/side-effecting
// messages are handled here; the rest are pure state transitions delegated to
// the reducer in messages.js (which is unit-tested).
//
function update(patch) {
  if (patch.op === 'exported') {
    let data = "data:" + patch.mimeType + ";charset=UTF-8," + encodeURIComponent(patch.contents)
    let link = document.createElement('a')
    link.setAttribute('download', 'scaredycat.' + patch.format)
    link.setAttribute('href', data)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    return
  }
  if (patch.op === 'autoUpdate') {
    merge({ urgent: { note: `Update to version ${patch.version}`,
      approve: () => {
        local.command('autoUpdateApproved')
        merge({ urgent: null })
      } } })
    return
  }
  if (patch.op === 'error') {
    if (patch.follow) {
      if (confirm(`${patch.message}\n\nAdd this follow anyway? (In case it might be down for the moment.)`)) {
        patch.follow.force = true
        local.command('save', patch.follow)
        return
      }
    } else {
      alert(patch.message)
    }
    let working = document.getElementById('working')
    if (working) working.setAttribute('style', '')
    document.querySelectorAll('form button').forEach(b => (b.disabled = false))
    return
  }

  let { state, nav } = reduce(store.value, patch)
  store.value = state
  if (nav) route(nav)
}

//
// On startup, connect to the background process and ask it to set up.
//
export async function init() {
  local = await storage()
  await local.client(msg => update(msg))
  local.command('setup')
  store.value.local = local
}

//
// Actions - thin wrappers over the background `command` channel.
//
export const loadPosts = id => local.command('loadPosts', id)
export const changeSetting = s => local.command('changeSetting', s)
export const subscribe = fc => local.command('subscribe', fc)
export const exportTo = format => local.command('exportTo', { format })

export const save = follow => {
  follow.editedAt = new Date()
  local.command('save', follow)
}

export const confirmRemove = follow => {
  if (confirm(`Delete ${followTitle(follow)}?\n(${follow.url})`))
    local.command('remove', follow)
}

export const importFrom = e => {
  let f = e.target.files[0]
  if (f) {
    let r = new FileReader()
    r.onload = function (o) {
      let contents = o.target.result, format = e.target.name
      local.command('importFrom', { format, contents })
      if (window.location.pathname === '/settings.html')
        window.close()
      else
        route('/')
    }
    r.readAsText(f)
  }
}
