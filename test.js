const test = require('ava')
const fs = require('fs')
const frago = require('./src/js/frago')

//
// 'frago' - piece merging tests
//
const syncParts = JSON.parse(fs.readFileSync('test/sync.json'))

test('basic merge on load', t => {
  t.plan(5)
  let sync = frago.merge(syncParts, 'follows')
  t.deepEqual(sync.follows['blog.presentandcorrect.com-f29bc778'],
    syncParts['follows/1']['blog.presentandcorrect.com-f29bc778'])
  t.is(1, sync.index['blog.presentandcorrect.com-f29bc778'])
  t.is(0, sync.index['warpdoor.com-3ae79d0c'])
  t.is(61, Object.keys(sync.follows).length)
  t.false(sync.settings.broadcast)
})

const PART_SIZE = 6400

function save(k, v) {
  let len = JSON.stringify(v).length
  if (len > PART_SIZE)
    throw new ArgumentError('too big!')
  return len
}

// new id
const add1 = {id: "discombobulated.co.nz-6679866", importance: "30",
  url: "https://discombobulated.co.nz/feed.rss", editedAt:"2019-10-25T22:03:12.632Z"}
// duplicate id
const add2 = {id: "granary.io-16f5f434", importance: "1", title: "IndieNews",
  url: "https://granary.io/url?input=html&output=atom&url=https%3A%2F%2Fnews.indieweb.org%2Fen",
  editedAt: "2019-10-07T22:04:30.365Z"}
// new id
const add3 = {id: "granary.io-5f16f434", importance: "7", title: "IndieNews",
  url: "https://granary.io/url?input=html&output=atom&url=https%3A%2F%2Fnews.indieweb.org%2Fen",
  editedAt: "2019-10-07T22:04:30.365Z"}

test('check sync part sizes', t => {
  t.plan(3)
  t.pass(save(0, syncParts['follows/0']))
  t.pass(save(0, syncParts['follows/1']))
  let part = Object.assign({}, syncParts['follows/0'])
  part[add1.id] = add1
  part[add2.id] = add2
  t.throws(() => save(0, part))
})

test('basic separation on save', async t => {
  t.plan(3)
  let sync = frago.merge(syncParts, 'follows'), len = 0
  await frago.separate(sync, 'follows', null,
    (k, v) => {
      t.assert(save(k, v) < PART_SIZE)
      len += Object.keys(v).length
    })
  t.is(61, len)
})

test('separation on additions', async t => {
  t.plan(3)
  let sync = frago.merge(syncParts, 'follows'), len = 0
  sync.follows[add1.id] = add1
  sync.follows[add2.id] = add2
  sync.follows[add3.id] = add3
  await frago.separate(sync, 'follows', [add1.id, add2.id, add3.id],
    (k, v) => {
      t.assert(save(k, v) < PART_SIZE)
      len += Object.keys(v).length
    })
  t.is(63, len)
})

test('separation on deletions', async t => {
  t.plan(3)
  let sync = frago.merge(syncParts, 'follows'), len = 0
  let keys = Object.keys(sync.follows)
  sync.follows[keys[0]] = {deleted: new Date()}
  sync.follows[keys[1]] = {deleted: new Date()}
  sync.follows[keys[2]] = {deleted: new Date()}
  await frago.separate(sync, 'follows', null,
    (k, v) => {
      t.assert(save(k, v) < PART_SIZE)
      len += Object.keys(v).length
    })
  t.is(61, len)
})

//
// Utility function tests
//
const feed = JSON.parse(fs.readFileSync('test/electrolemon.json'))

test('electrolemon: sort by fields', t => {
  t.plan(2)

  frago.sort(feed, 'updatedAt', true, true)
  t.is(feed.posts.slice(0, 4).map(x => x.id).join(','),
    'twitter.com-104e3097,twitter.com-9c0d8cfc,twitter.com-9dde7abc,twitter.com-cab7bde')
  let posts = frago.master(feed, ['publishedAt', 'updatedAt'], 10)
  t.assert(posts.some(x => x.id === 'twitter.com-104e3097'))
})

//
// Hash router matching (src/js/router-match.js) - the parsing/matching that
// drives navigation in the Preact UI.
//
const rm = require('./src/js/router-match')

test('router: parseHash splits pathname and query', t => {
  t.deepEqual(rm.parseHash('#!/tag/comics?importance=1'),
    { pathname: '/tag/comics', search: 'importance=1', hashRouting: true })
  t.is(rm.parseHash('').pathname, '/')          // empty hash -> root
  t.is(rm.parseHash('#!/').pathname, '/')
  t.is(rm.parseHash('#!/settings').search, '')
})

test('router: matchPath extracts :params and query together', t => {
  let tag = rm.matchPath('/tag/:tag', { pathname: '/tag/comics', search: '' })
  t.is(tag.params.tag, 'comics')

  let view = rm.matchPath('/view/:id',
    { pathname: '/view/kicks', search: 'importance=0&tag=%F0%9F%8F%A0' })
  t.is(view.params.id, 'kicks')
  t.is(view.params.importance, '0')
  t.is(view.params.tag, '\u{1f3e0}')           // %F0%9F%8F%A0 decodes to the house emoji
})

test('router: catch-all matches, mismatches return null', t => {
  t.truthy(rm.matchPath(undefined, { pathname: '/anything', search: '' }))
  t.truthy(rm.matchPath('/settings', { pathname: '/settings', search: '' }).isExact)
  t.is(rm.matchPath('/tag/:tag', { pathname: '/settings', search: '' }), null)
  t.is(rm.matchPath('/edit/:id', { pathname: '/view/x', search: '' }), null)
})

//
// Background-message reducer (src/js/messages.js) - the state transitions the
// store applies when the background talks to the UI. Message shapes mirror
// those produced by the mock and webext storage backends.
//
const { reduce } = require('./src/js/messages')

test('messages: initial load merges state and marks started', t => {
  let start = { all: {}, started: false, settings: {} }
  let out = reduce(start, { all: { kicks: { id: 'kicks' } }, settings: { x: 1 }, started: true })
  t.true(out.state.started)
  t.deepEqual(out.state.all, { kicks: { id: 'kicks' } })
  t.deepEqual(out.state.settings, { x: 1 })
  t.falsy(out.nav)
})

test('messages: load sets the focused follow', t => {
  let out = reduce({ started: true }, { op: 'load', id: 'kicks', meta: { id: 'kicks', posts: [] } })
  t.is(out.state.focus.id, 'kicks')
})

test('messages: replace patch updates a follow in place', t => {
  let out = reduce({ all: { kicks: { id: 'kicks', title: 'old' } }, started: true },
    { op: 'replace', path: '/all/kicks', value: { id: 'kicks', title: 'new' } })
  t.is(out.state.all.kicks.title, 'new')
})

test('messages: replace patch updates settings', t => {
  let out = reduce({ settings: {}, started: true },
    { op: 'replace', path: '/settings', value: { 'mode-theme': 'dark' } })
  t.is(out.state.settings['mode-theme'], 'dark')
})

test('messages: remove patch deletes a follow', t => {
  let out = reduce({ all: { kicks: { id: 'kicks' } }, started: true },
    { op: 'remove', path: '/all/kicks' })
  t.false('kicks' in out.state.all)
})

test('messages: subscription navigates to the follow', t => {
  let tagged = reduce({}, { op: 'subscription', follow: { tags: ['comics'], importance: 1 } })
  t.is(tagged.nav, '/tag/comics?importance=1')
  let home = reduce({}, { op: 'subscription', follow: { importance: 0 } })
  t.is(home.nav, '/?importance=0')
})

test('messages: discovery stores feeds and navigates to picker', t => {
  let out = reduce({}, { op: 'discovery', feeds: [{ url: 'x' }], follow: { url: 'site' } })
  t.is(out.nav, '/add-feed')
  t.deepEqual(out.state.feeds, { list: [{ url: 'x' }], site: { url: 'site' } })
})

test('messages: interactive ops pass through untouched', t => {
  for (let op of ['error', 'exported', 'autoUpdate']) {
    let state = { started: true }
    let out = reduce(state, { op })
    t.true(out.passthrough)
    t.is(out.state, state)                      // caller handles these; state unchanged
    t.falsy(out.nav)
  }
})
