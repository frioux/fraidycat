//
// src/offscreen.js
//
import './js/environment'
import 'regenerator-runtime/runtime'
const mixin = require('./js/storage')
const storage = require('./js/storage-platform')

//
// This script runs in the extension's offscreen document, fetching feeds
// and communicating stuff to the foreground pages. Under Manifest V3 the
// service worker can't do this work - it has no DOM (needed to parse
// feeds and render sites in iframes) and doesn't stick around - so the
// offscreen document acts as the old persistent background page, with
// the service worker (src/background.js) brokering the browser APIs
// that offscreen documents aren't allowed to call.
//
let start = async function () {
  let local = await storage()
  Object.assign(local, mixin)
  //
  // Register for messages right away - the service worker may relay a
  // message from the Fraidycat page the moment this document exists -
  // but queue them up until setup has finished.
  //
  let pending = [], handle = msg => pending.push(msg)
  local.server(msg => handle(msg))
  console.log(`Started up Fraidycat offscreen page. (${local.id})`)
  await local.setup()
  local.backgroundSetup()
  handle = msg => local[msg.action](msg.data, msg.sender)
  pending.forEach(handle)
}
start()
