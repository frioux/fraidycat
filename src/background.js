//
// src/background.js
//
// The Manifest V3 service worker. The actual Fraidycat background work -
// fetching feeds, scraping, syncing - happens in an offscreen document
// (src/offscreen.js), because it needs DOM APIs (DOMParser, iframes for
// rendering JavaScript-heavy sites) that service workers don't have.
//
// Offscreen documents can only use the runtime messaging API, so this
// worker acts as a broker:
//
//  * Creates the offscreen document and makes sure it stays around.
//  * Proxies browser API calls (storage, tabs, action, ...) on its behalf.
//  * Relays messages from the Fraidycat page (the bundled index.html) to it.
//  * Forwards events (storage.onChanged, tabs.onUpdated, webRequest
//    .onCompleted) to it.
//  * Stands in for the old blocking webRequest listeners with
//    declarativeNetRequest rules: a fixed rule that strips the headers
//    which would prevent sites from loading in the offscreen document's
//    iframes, and per-request rules that rewrite the User-Agent of the
//    extension's own fetches.
//
// The Fraidycat UI is the extension's own bundled page, served from
// chrome-extension://<id>/index.html - not the hosted fraidyc.at site.
const homepage = chrome.runtime.getURL('index.html')

//
// The offscreen document. Creation is guarded so concurrent callers don't
// race to create it twice.
//
let creating = null
async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument())
    return
  if (!creating) {
    creating = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['DOM_PARSER', 'DOM_SCRAPING', 'IFRAME_SCRIPTING'],
      justification: 'Scaredycat periodically fetches and scrapes the feeds ' +
        '(RSS, social media) that you follow. Some sites can only be read ' +
        'by rendering them in an iframe.'
    }).catch(err => {
      // Another context may have won the race - only a missing document
      // is a real problem.
      return chrome.offscreen.hasDocument().then(has => {
        if (!has) throw err
      })
    }).finally(() => { creating = null })
  }
  return creating
}

//
// declarativeNetRequest rules. Rule 1 is permanent (for the session):
// it strips the headers that block extension iframes, standing in for the
// old blocking onHeadersReceived listener. Rules above 1 are transient,
// added around a single fetch to rewrite its User-Agent or Cookie - the
// old blocking onBeforeSendHeaders listener.
//
const IFRAME_RULE_ID = 1
let nextRuleId = 2

async function initRules() {
  let existing = await chrome.declarativeNetRequest.getSessionRules()
  // The worker restarts many times per browser session - don't clobber
  // rules that an in-flight fetch may be relying on, just pick up the
  // ID sequence where it left off.
  nextRuleId = existing.reduce((max, rule) => Math.max(max, rule.id + 1), 2)
  if (existing.some(rule => rule.id === IFRAME_RULE_ID))
    return
  await chrome.declarativeNetRequest.updateSessionRules({
    addRules: [{
      id: IFRAME_RULE_ID,
      priority: 1,
      condition: {
        initiatorDomains: [chrome.runtime.id],
        resourceTypes: ['sub_frame']
      },
      action: {
        type: 'modifyHeaders',
        responseHeaders: [
          {header: 'x-frame-options', operation: 'remove'},
          {header: 'frame-options', operation: 'remove'},
          {header: 'content-security-policy', operation: 'remove'}
        ]
      }
    }]
  })
}

async function addHeaderRule(url, headers) {
  let id = nextRuleId++
  if (nextRuleId > 100000)
    nextRuleId = 2
  let requestHeaders = Object.entries(headers).
    map(([header, value]) => ({header, operation: 'set', value}))
  requestHeaders.push({header: 'x-fc-user-agent', operation: 'remove'})
  requestHeaders.push({header: 'x-fc-cookie', operation: 'remove'})
  await chrome.declarativeNetRequest.updateSessionRules({
    addRules: [{
      id,
      priority: 2,
      condition: {
        initiatorDomains: [chrome.runtime.id],
        resourceTypes: ['xmlhttprequest'],
        urlFilter: '|' + url.split('#')[0]
      },
      action: {type: 'modifyHeaders', requestHeaders}
    }]
  })
  return id
}

//
// The browser API calls the offscreen document is allowed to make.
//
const calls = {
  'storage.local.get': key => chrome.storage.local.get(key),
  'storage.local.set': items => chrome.storage.local.set(items),
  'storage.local.remove': key => chrome.storage.local.remove(key),
  'storage.sync.get': key => chrome.storage.sync.get(key),
  'storage.sync.set': items => chrome.storage.sync.set(items),
  'storage.sync.remove': key => chrome.storage.sync.remove(key),
  'tabs.query': info => chrome.tabs.query(info),
  'tabs.create': opts => chrome.tabs.create(opts),
  'tabs.reload': tabId => chrome.tabs.reload(tabId),
  'tabs.sendMessage': (tabId, msg) => chrome.tabs.sendMessage(tabId, msg),
  'action.setIcon': details => chrome.action.setIcon(details),
  'action.setTitle': details => chrome.action.setTitle(details),
  'action.setPopup': details => chrome.action.setPopup(details),
  'dnr.addHeaderRule': (url, headers) => addHeaderRule(url, headers),
  'dnr.removeRule': id => chrome.declarativeNetRequest.
    updateSessionRules({removeRuleIds: [id]})
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.fc === 'proxy') {
    let fn = calls[msg.fn]
    Promise.resolve().then(() => fn(...(msg.args || []))).
      then(result => sendResponse({result})).
      catch(err => sendResponse({error: (err && err.message) || String(err)}))
    return true
  }

  //
  // Messages from the Fraidycat page (or the settings page) - pass them
  // on to the offscreen document, waking it up if need be.
  //
  if (msg && msg.action && sender.tab) {
    ensureOffscreen().then(() =>
      chrome.runtime.sendMessage({fc: 'server', action: msg.action,
        data: msg.data, tabId: sender.tab.id})).catch(() => {})
  }
})

//
// Forward events that the offscreen document can't subscribe to itself.
//
function forward(event) {
  ensureOffscreen().then(() =>
    chrome.runtime.sendMessage(Object.assign({fc: 'event'}, event))).
    catch(() => {})
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && 'id' in changes)
    forward({name: 'storage.sync.onChanged', changes})
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url &&
      tab.url.startsWith('http') && !tab.url.startsWith(homepage))
    forward({name: 'tabs.onUpdated', tabId, url: tab.url})
})

//
// Notifies the scraper when a rendered page (in an offscreen iframe)
// completes a background request - so the scraper can pull that same
// JSON itself. (tabId of -1 means the request didn't come from a tab;
// parentFrameId of 0 means it came from a direct child frame.)
//
chrome.webRequest.onCompleted.addListener(e => {
  if (e.tabId === -1 && e.parentFrameId === 0)
    forward({name: 'webRequest.onCompleted', url: e.url})
}, {urls: ['<all_urls>'], types: ['xmlhttprequest']})

//
// Open Fraidycat when the extension icon is clicked. (When a followable
// feed is detected on the current page, a popup is set for the tab and
// this event doesn't fire.)
//
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({url: homepage})
})

//
// The offscreen document ought to live forever, but check on it every
// minute in case Chrome has thrown it away.
//
chrome.alarms.create('fraidycat-heartbeat', {periodInMinutes: 1})
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'fraidycat-heartbeat')
    ensureOffscreen()
})

initRules()
ensureOffscreen()
