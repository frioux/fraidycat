//
// scraper.test.js
//
// Unit tests for the vendored scraping engine (src/js/fraidyscrape). These run
// in plain Node - the engine is CommonJS and its JSON/text paths need no DOM,
// so we can exercise rule detection, request building and the JSON scrape
// pipeline directly. (The HTML/XML paths need a browser DOMParser + xpath and
// are covered by the app at runtime rather than here.)
//
const test = require('ava')
const F = require('./src/js/fraidyscrape')
const defs = require('./defs/social.json')

// A scraper over the real shipped rules. parser/xpath are only touched by the
// HTML/XML paths, so JSON-only tests can leave them null.
const social = () => new F(defs, null, null)

// Drain a detect() queue into the concrete requests it would fire.
function requestsFor(scraper, url) {
  let tasks = scraper.detect(url), reqs = [], req
  while ((req = scraper.nextRequest(tasks)))
    reqs.push({ id: req.id, url: req.url })
  return reqs
}

//
// detect() - match a URL against the ruleset, capture arguments, build a queue.
//
test('detect: known platform URL selects its rule', t => {
  let tasks = social().detect('https://www.reddit.com/r/programming')
  t.is(tasks.queue[tasks.queue.length - 1], 'reddit.com:sub')
  t.is(tasks.vars.url, 'https://www.reddit.com/r/programming')
})

test('detect: unknown URL falls back to the default rule', t => {
  let tasks = social().detect('https://some-random-blog.example/posts')
  t.deepEqual(tasks.queue, ['default'])
  t.is(tasks.vars.url, 'https://some-random-blog.example/posts')
})

//
// nextRequest()/setupRequest() - build the concrete request URL. This is what
// exercises the native-URL request builder that replaced the `url` polyfill:
// captured arguments are interpolated and the rule's querystring is preserved.
//
test('nextRequest: interpolates captured args into the feed URL', t => {
  let reqs = requestsFor(social(), 'https://www.youtube.com/channel/UC123')
  t.is(reqs.length, 1)
  t.is(reqs[0].id, 'youtube.com:channel')
  t.is(reqs[0].url, 'https://www.youtube.com/feeds/videos.xml?channel_id=UC123')
})

test('nextRequest: preserves an existing querystring on the rule URL', t => {
  let reqs = requestsFor(social(), 'https://www.reddit.com/r/programming')
  t.is(reqs[0].url, 'https://www.reddit.com/r/programming/top/.rss?sort=top')
})

test('nextRequest: expands a multi-step queue (token then data)', t => {
  let reqs = requestsFor(social(), 'https://twitter.com/jack')
  t.deepEqual(reqs.map(r => r.id),
    ['twitter.com:token', 'twitter.com:user', 'twitter.com:timeline'])
  // The pre-encoded querystring (%2C for commas) survives URL rebuilding.
  t.true(reqs[2].url.includes('ext=mediaStats%2ChighlightedLabel'))
})

//
// scrape() - full JSON pipeline: jsonpath extraction, nested rule recursion,
// and the assign transforms (html-to-text, url, date). The `url` transform is
// the other native-URL replacement, so relative post links must resolve
// against the feed's base URL.
//
function jsonResponse(url, body) {
  return {
    status: 200, ok: true, url,
    headers: new Map([['content-type', 'application/json']]),
    text: async () => JSON.stringify(body)
  }
}

const JSON_FEED = {
  version: 'https://jsonfeed.org/version/1',
  title: 'Example &amp; Co Blog',
  home_page_url: 'https://blog.example.com/',
  description: 'A test feed',
  icon: 'https://blog.example.com/avatar.png',
  items: [
    { id: '1', url: '/2020/01/hello', title: 'Hello &amp; welcome',
      content_html: '<p>Hi</p>', date_published: '2020-01-02T10:00:00Z' },
    { id: '2', url: 'https://blog.example.com/2020/02/second', title: 'Second post',
      content_html: '<p>More</p>', date_published: '2020-02-03T12:00:00Z' }
  ]
}

test('scrape: extracts a JSON Feed into normalized posts', async t => {
  let scraper = social()
  let tasks = { queue: [], vars: { url: 'https://blog.example.com/' } }
  let res = jsonResponse('https://blog.example.com/feed.json', JSON_FEED)
  let out = (await scraper.scrape(tasks, { id: 'jsonfeed' }, res)).out

  // html-to-text decodes entities in the feed title.
  t.is(out.title, 'Example & Co Blog')
  t.is(out.photos.avatar, 'https://blog.example.com/avatar.png')
  t.is(out.posts.length, 2)

  // The `url` transform resolves a relative post link against the base URL...
  t.is(out.posts[0].url, 'https://blog.example.com/2020/01/hello')
  t.is(out.posts[0].title, 'Hello & welcome')
  t.true(out.posts[0].publishedAt instanceof Date)

  // ...and leaves an already-absolute link untouched.
  t.is(out.posts[1].url, 'https://blog.example.com/2020/02/second')
})

//
// A rule-independent unit for the transform pipeline - pins the behavior of the
// native-URL `url` transform alongside the other mods, without depending on the
// shipped ruleset.
//
test('scrape: assign transforms (url, int, slug) applied to values', async t => {
  let scraper = new F({
    widget: {
      acceptJson: [
        { var: 'out:link', op: '$.path', mod: ['url'] },
        { var: 'out:count', op: '$.count', mod: ['int'] },
        { var: 'out:slugged', op: '$.tag', mod: ['slug'] }
      ]
    }
  }, null, null)
  let tasks = { queue: [], vars: { url: 'https://host.example/base/' } }
  let res = jsonResponse('https://host.example/x.json',
    { path: '/x/y', count: '42', tag: 'hello world' })
  let out = (await scraper.scrape(tasks, { id: 'widget' }, res)).out

  t.is(out.link, 'https://host.example/x/y')   // resolved via native URL
  t.is(out.count, 42)                          // coerced to Number
  t.is(out.slugged, '#hello%20world')          // slug encodes the value
})
