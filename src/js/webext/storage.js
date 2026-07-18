//
// The platform-specific code for web extensions. (Relies heavily on the
// webextension-polyfill, which acts as a common API between Firefox and
// Chrome.)
//
// Under Manifest V3, this class runs in two sorts of places:
//
//  * The offscreen document (src/offscreen.js) - the background, where
//    feeds are fetched and scraped. Offscreen documents may only use
//    runtime messaging, so every other browser API call here goes
//    through the `proxy` method, which asks the service worker
//    (src/background.js) to make the call.
//  * The Fraidycat page itself - the bundled index.html and the
//    settings page - which only uses `client` and `command` to talk
//    to the background.
//
import { jsonDateParser } from "json-date-parser"
import { fixupHeaders, parseDom, xpathDom } from '../util'
const browser = require("webextension-polyfill")
const frago = require('../frago')
const homepage = browser.runtime.getURL('index.html')

const FIREFOX_QUOTA_BYTES_PER_ITEM = 8192;

class WebextStorage {
  constructor(id) {
    this.id = id
    this.dom = parseDom
    this.baseHref = browser.runtime.getURL ?
      browser.runtime.getURL('/').slice(0, -1) : ''
    this.xpath = xpathDom
  }

  //
  // Ask the service worker to make a browser API call on our behalf.
  //
  async proxy(fn, ...args) {
    let res = await browser.runtime.sendMessage({fc: 'proxy', fn, args})
    if (res && res.error)
      throw new Error(res.error)
    return res && res.result
  }

  //
  // JSON convenience.
  //
  encode(obj) {
    return JSON.stringify(obj)
  }

  decode(str) {
    return JSON.parse(str, jsonDateParser)
  }

  //
  // I/O functions.
  //
  async fetch(url, options) {
    let custom = {}
    if (options && options.headers) {
      for (let k of ['User-Agent', 'Cookie']) {
        if (options.headers[k])
          custom[k] = options.headers[k]
      }
    }
    let req = new Request(url, fixupHeaders(options, ['Cookie', 'User-Agent']))
    if (Object.keys(custom).length === 0)
      return fetch(req)

    //
    // A fetch can't set these headers itself - a declarativeNetRequest
    // rule (added by the service worker) rewrites them for this one URL
    // while the fetch is under way.
    //
    let ruleId = null
    try {
      ruleId = await this.proxy('dnr.addHeaderRule', url, custom)
      return await fetch(req)
    } finally {
      if (ruleId)
        this.proxy('dnr.removeRule', ruleId).catch(() => {})
    }
  }

  async render(req, tasks) {
    let site = this.scraper.options[req.id]
    let iframe = document.createElement("iframe")
    iframe.src = req.url
    return new Promise((resolve, reject) => {
      this.scraper.addWatch(req.url, {tasks, resolve, reject, iframe, render: req.render,
        remove: () => {
          iframe.src = "about:blank"
          setTimeout(() => iframe.remove(), 1000)
        }})
      iframe.addEventListener('load', e => {
        iframe.contentWindow.postMessage(this.encode({url: req.url, tasks, site}), '*')
      })
      document.body.appendChild(iframe)
      setTimeout(() => this.scraper.removeWatch(req.url), 40000)
    })
  }

  async scrapeLive(url, tabId) {
    let tasks = this.scraper.detect(url)
    let id = tasks.queue.shift()
    let site = this.scraper.options[id]
    return this.proxy('tabs.sendMessage', tabId,
      {req: this.encode({url, tasks, site}), options: this.socialJson}).
      then(resp => {
        let obj = this.decode(resp)
        obj.site = id
        let out = obj.tasks?.vars?.out
        if (out?.posts?.length > 0) {
          out.posts = out.posts.slice(0, 5)
        }
        return obj
      })
  }

  async mkdir(dest) {
    return null
  }

  async localGet(path, def) {
    return this.proxy('storage.local.get', path).
      then(items => {
        let obj = items[path]
        if (typeof(obj) === 'string')
          obj = this.decode(obj)
        return (obj || def)
      })
  }

  async localSet(path, data) {
    return this.proxy('storage.local.set', {[path]: this.encode(data)})
  }

  async readFile(path, raw) {
    return new Promise((resolve, reject) => {
      this.proxy('storage.local.get', path).then(items => {
          let obj = items[path]
          if (typeof(obj) === 'string' && !raw)
            obj = this.decode(obj)
          if (!obj)
            reject()
          else
            resolve(obj)
        })
    })
  }

  async writeFile(path, data, raw) {
    if (!raw)
      data = this.encode(data)
    return this.proxy('storage.local.set', {[path]: data})
  }

  async deleteFile(path) {
    return this.proxy('storage.local.remove', path)
  }

  //
  // The following 'Synced' functions all do I/O to browser.storage.sync. (The
  // synced data for an extension.)
  //
  // Since you can only sync 8k JSON files (up to 512 of them), I'll need to
  // split up the sync file into pieces. I've decided to do this chronologically -
  // so the first split would contain the first N (in addition order) and so on.
  // This is all managed by a master index that lists what goes where.
  //
  // The object being read/written needs to have an `index` key with an object
  // of `id`: `part` pairing - `part` being the number of the piece containing
  // an object by that `id`. The `subkey` param points to the subkey that's
  // being indexed.
  //
  async readSynced(subkey) {
    return new Promise((resolve, reject) => {
      this.proxy('storage.sync.get', null).then(items =>
        resolve(this.mergeSynced(items, subkey)))
    })
  }

  //
  // Loads synced data, building the index as we go.
  //
  mergeSynced(items, subkey) {
    return frago.merge(items, subkey, this.decode)
  }

  async writeSynced(items, subkey, ids) {
    // console.log(["OUTGOING", items, ids])
    let id = this.encode([this.id, new Date()])
    if (subkey && subkey in items) {
      await frago.separate(items, subkey, ids, (k, v) => {
        let kv = {[k]: this.encode(v)}
        if (k.length + kv[k].length > FIREFOX_QUOTA_BYTES_PER_ITEM) {
          throw "QUOTA_BYTES_PER_ITEM quota exceeded."
        }
        return this.proxy('storage.sync.set', {...kv, id})
      })
      delete items[subkey]
      delete items.index
    }

    let len = 0
    for (let k in items) {
      items[k] = this.encode(items[k])
      len++
    }
    if (len > 0) {
      items.id = id
      await this.proxy('storage.sync.set', items)
    }
  }

  //
  // Messaging functions.
  //
  // Messages from the Fraidycat page arrive wrapped in a {fc: 'server'}
  // envelope: the service worker receives them from the content script
  // and relays them here (creating this document first, if Chrome hasn't
  // yet). The tab they came from rides along as `tabId`.
  //
  server(fn) {
    browser.runtime.onMessage.addListener((msg) => {
      if (msg && msg.fc === 'server' && msg.action) {
        let req = {action: msg.action, sender: msg.tabId}
        if (msg.data)
          req.data = this.decode(msg.data)
        fn(req)
      }
    })
  }

  async client(fn) {
    browser.runtime.onMessage.addListener((msg) => {
      //
      // Updates from the background arrive as encoded strings (through
      // tabs.sendMessage) - anything else on this channel is extension
      // plumbing (proxy calls, relays) meant for other listeners.
      //
      if (typeof(msg) === 'string')
        fn(this.decode(msg))
    })
  }

  command(action, data) {
    if (data)
      data = this.encode(data)
    browser.runtime.sendMessage({action, data})
  }

  sendUpdate(data, tabs) {
    for (let id of tabs) {
      this.proxy('tabs.sendMessage', id, this.encode(data)).catch(() => {})
    }
  }

  update(data, receiver) {
    if (receiver) {
      this.sendUpdate(data, [receiver])
    } else {
      this.proxy('tabs.query', {url: homepage}).then(tabs =>
        this.sendUpdate(data, tabs.map(x => x.id))).catch(() => {})
    }
  }

  //
  // Called once to initialize the background (offscreen) document.
  //
  backgroundSetup() {
    //
    // Events forwarded by the service worker - offscreen documents can't
    // subscribe to these themselves.
    //
    browser.runtime.onMessage.addListener((msg) => {
      if (!msg || msg.fc !== 'event')
        return
      if (msg.name === 'storage.sync.onChanged') {
        let dict = msg.changes
        if (!('id' in dict))
          return

        // Only handle messages from other IDs.
        let sender = this.decode(dict.id.newValue)
        if (sender[0] === this.id)
          return

        let changes = {}
        for (let path in dict)
          changes[path] = dict[path].newValue
        this.onSync(changes)
      } else if (msg.name === 'tabs.onUpdated') {
        this.detectFeed(msg.url, msg.tabId)
      } else if (msg.name === 'webRequest.onCompleted') {
        if (this.scraper)
          this.onRender(msg.url)
      }
    })

    window.addEventListener('message', e => {
      let {url, tasks, error} = this.decode(e.data)
      this.scraper.updateWatch(url, tasks, error)
    }, false)

    //
    // Reload any open Fraidycat tabs, so they hook up with this fresh
    // background.
    //
    this.proxy('tabs.query', {url: homepage}).then(tabs =>
      tabs.map(x => this.proxy('tabs.reload', x.id))).catch(() => {})
  }

  //
  // Show the 'Follow' popup on the extension icon whenever a page with a
  // detectable feed is loaded in a tab.
  //
  detectFeed(url, tabId) {
    this.urlDetails(url, tabId).then(({found, feed}) => {
      // console.log([`${url} => ${found}`, feed])
      if (found === 1) {
        try {
          feed = JSON.parse(JSON.stringify(feed))
          if (feed.sources?.length > 5) {
            feed.sources = feed.sources.slice(0, 5)
          }
          this.proxy('action.setIcon', {tabId, path: "images/portrait.png"})
          this.proxy('action.setTitle', {tabId, title: "Follow with Scaredycat"})
          this.proxy('action.setPopup', {tabId, popup: "popup.html?feed=" +
            encodeURIComponent(JSON.stringify(feed))})
        } catch {}
      }
    })
  }
}

module.exports = async function () {
  let session = Math.random().toString(36)
  return new WebextStorage(session)
}
