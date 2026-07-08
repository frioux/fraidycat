//
// src/js/messages.js
//
// Pure reducer for messages arriving from the background process. Given the
// current follows state and a message, it returns the next state and an
// optional navigation target. Interactive / side-effecting messages
// (`exported`, `autoUpdate`, `error`) are flagged `passthrough` and handled by
// the caller (store.js). Framework-free, so it can be unit-tested directly.
//
const { applyOperation } = require('fast-json-patch')

const PASSTHROUGH = { exported: true, autoUpdate: true, error: true }

function reduce(state, patch) {
  if (patch.op === 'load')
    return { state: { ...state, focus: patch.meta } }

  if (patch.op === 'discovery')
    return {
      state: { ...state, feeds: { list: patch.feeds, site: patch.follow } },
      nav: '/add-feed'
    }

  if (patch.op === 'subscription')
    return {
      state,
      nav: `/${patch.follow.tags && patch.follow.tags[0] ?
        `tag/${encodeURIComponent(patch.follow.tags[0])}` : ''}?importance=${patch.follow.importance}`
    }

  if (PASSTHROUGH[patch.op])
    return { state, passthrough: true }

  if (patch.op) {
    // A JSON-patch operation: apply in place, then hand back a fresh top-level
    // reference so the signal notifies subscribers.
    try { applyOperation(state, patch) } catch {}
    return { state: { ...state } }
  }

  // No `op`: a whole-state merge (e.g. the initial load).
  return { state: { ...state, ...patch } }
}

module.exports = { reduce }
