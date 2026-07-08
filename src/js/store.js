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
import { applyOperation } from 'fast-json-patch'
import { followTitle } from './util'
import { route } from './router'
const storage = require('./storage-platform')
const { alert, confirm } = require('./dialogs')

export const store = signal({ all: {}, started: false, settings: {}, updating: {} })

let local = null

function merge(partial) {
  store.value = { ...store.value, ...partial }
}

//
// Receive an update from the background process.
//
function update(patch) {
  if (patch.op === 'load') {
    merge({ focus: patch.meta })
  } else if (patch.op === 'discovery') {
    route('/add-feed')
    merge({ feeds: { list: patch.feeds, site: patch.follow } })
  } else if (patch.op === 'subscription') {
    route(`/${patch.follow.tags && patch.follow.tags[0] ?
      `tag/${encodeURIComponent(patch.follow.tags[0])}` : ''}?importance=${patch.follow.importance}`)
  } else if (patch.op === 'exported') {
    let data = "data:" + patch.mimeType + ";charset=UTF-8," + encodeURIComponent(patch.contents)
    let link = document.createElement('a')
    link.setAttribute('download', 'fraidycat.' + patch.format)
    link.setAttribute('href', data)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  } else if (patch.op === 'autoUpdate') {
    merge({ urgent: { note: `Update to version ${patch.version}`,
      approve: () => {
        local.command('autoUpdateApproved')
        merge({ urgent: null })
      } } })
  } else if (patch.op === 'error') {
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
  } else if (patch.op) {
    // A JSON-patch operation from the background: apply it in place, then
    // publish a fresh top-level reference so the signal notifies subscribers.
    try {
      applyOperation(store.value, patch)
      store.value = { ...store.value }
    } catch {}
  } else {
    // No `op`: a whole-state merge (e.g. the initial load).
    merge(patch)
  }
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
export const rename = tag => local.command('rename', tag)
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
