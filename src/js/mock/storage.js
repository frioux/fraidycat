//
// A mock storage platform for iterating on the UI in a plain browser tab
// (no extension machinery, no server). Run with:
//
//   pnpm dev
//
// Fixture follows cover the visual range: every importance level, tags,
// statuses, long titles, sparkline shapes, and a details pane.
//
const HOUR = 3600 * 1000
const DAY = 24 * HOUR
const now = Date.now()
const ago = ms => new Date(now - ms)

// Deterministic pseudo-random activity (posts per day, most recent first).
const activity = (seed, chance, burst) => {
  let out = [], x = seed
  for (let i = 0; i < 180; i++) {
    x = (x * 48271) % 2147483647
    out.push((x / 2147483647) < chance ? 1 + (x % burst) : 0)
  }
  return out
}

const posts = (base, list) => list.map(([hoursAgo, title], i) => ({
  id: `${base}-${i}`,
  url: `https://example.com/${base}/${i}`,
  title,
  publishedAt: ago(hoursAgo * HOUR),
  updatedAt: ago(hoursAgo * HOUR)
}))

const FOLLOWS = {
  'kicks': {
    id: 'kicks', feed: 'https://www.kickscondor.com/rss.xml',
    url: 'https://www.kickscondor.com/', title: 'Kicks Condor',
    importance: 0, tags: null, author: 'kicks',
    createdAt: ago(700 * DAY), updatedAt: ago(2 * HOUR), editedAt: ago(700 * DAY),
    activity: activity(7, 0.18, 2),
    status: [
      {type: 'live', url: 'https://www.kickscondor.com/live', title: 'streaming the hypertext salon', publishedAt: ago(0.4 * HOUR), updatedAt: ago(0.4 * HOUR)},
      {type: 'note', text: 'working on fraidycat 2 — send patches', publishedAt: ago(5 * HOUR), updatedAt: ago(5 * HOUR)}
    ],
    posts: posts('kicks', [
      [2, 'Foundations of a Tiny Directory'],
      [30, 'The Blog as a Fractal Surface — and Other Excuses for Never Finishing Anything at All, Ever'],
      [26 * 24, 'HrefHunt! June'],
      [50 * 24, 'Notes: The Anxiety of Influencers']
    ])
  },
  'xkcd': {
    id: 'xkcd', feed: 'https://xkcd.com/atom.xml',
    url: 'https://xkcd.com/', title: 'xkcd',
    importance: 1, tags: ['comics'],
    createdAt: ago(400 * DAY), updatedAt: ago(20 * HOUR), editedAt: ago(400 * DAY),
    activity: activity(13, 0.42, 1),
    posts: posts('xkcd', [
      [20, 'Alert Fatigue'],
      [68, 'Software Testing Day'],
      [116, 'Greenhouse Effect']
    ])
  },
  'oglaf': {
    id: 'oglaf', feed: 'https://www.oglaf.com/feeds/rss/',
    url: 'https://www.oglaf.com/', title: 'Oglaf!',
    importance: 1, tags: ['comics'],
    createdAt: ago(300 * DAY), updatedAt: ago(3 * DAY), editedAt: ago(300 * DAY),
    activity: activity(29, 0.14, 1),
    posts: posts('oglaf', [
      [3 * 24, 'The Bright Road'],
      [10 * 24, 'Sword Facts'],
      [17 * 24, 'Blossom']
    ])
  },
  'siderea': {
    id: 'siderea', feed: 'https://siderea.dreamwidth.org/data/rss',
    url: 'https://siderea.dreamwidth.org/', title: 'Sibylla Bostoniensis',
    importance: 7, tags: null, author: 'siderea',
    createdAt: ago(200 * DAY), updatedAt: ago(6 * DAY), editedAt: ago(200 * DAY),
    activity: activity(41, 0.06, 2),
    posts: posts('siderea', [
      [6 * 24, 'The Difference Between Amateur and Professional Practice in Psychotherapy, Part 4: A Really Quite Long Series of Caveats'],
      [40 * 24, '[psych] The Fundamental Question'],
      [80 * 24, '[med, US] Actuarial Tables']
    ])
  },
  'notitle': {
    id: 'notitle', feed: 'https://ambientmusicguide.com/feed/',
    url: 'https://ambientmusicguide.com/',
    importance: 30, tags: ['music'],
    createdAt: ago(150 * DAY), updatedAt: ago(25 * DAY), editedAt: ago(150 * DAY),
    activity: activity(59, 0.03, 1),
    posts: posts('ambient', [
      [25 * 24, 'Mixcloud selections June: deep space drift'],
      [70 * 24, 'Review: endless melancholy — the vacation']
    ])
  },
  'quiet': {
    id: 'quiet', feed: 'https://example.org/feed.xml',
    url: 'https://example.org/', title: 'A Very Quiet Blog',
    importance: 365, tags: null,
    createdAt: ago(600 * DAY), updatedAt: ago(200 * DAY), editedAt: ago(600 * DAY),
    activity: activity(3, 0.008, 1),
    posts: posts('quiet', [
      [200 * 24, 'Still here'],
      [420 * 24, 'On the pleasures of not updating your blog']
    ])
  }
}

// Details for the focus pane (/view/:id).
const DETAILS = follow => {
  let details = {}
  for (let post of follow.posts) {
    details[post.id] = {
      ...post,
      author: follow.author,
      html: `<p>Here is a fine paragraph of post body text, so the reading
        pane has something to show. It carries on for a couple of sentences
        to give a feel for line-height, measure and paragraph spacing.</p>
        <p>A second paragraph, with <a href="#">a link</a>, some <em>emphasis</em>
        and <strong>bold text</strong> for good measure.</p>`
    }
  }
  return details
}

class MockStorage {
  async client(fn) {
    this.clientFn = fn
  }

  command(action, data) {
    console.log(`[mock] command: ${action}`, data)
    switch (action) {
      case 'setup':
        setTimeout(() => this.clientFn({all: FOLLOWS, settings: {}, started: true}), 200)
        break
      case 'loadPosts': {
        let follow = FOLLOWS[data]
        if (follow)
          this.clientFn({op: 'load', id: data, meta: {...follow, details: DETAILS(follow)}})
        break
      }
      case 'changeSetting': {
        let settings = Object.assign({}, this.settings, {[data.name]: data.value})
        this.settings = settings
        this.clientFn({op: 'replace', path: '/settings', value: settings})
        break
      }
      case 'save':
        data.id = data.id || 'saved'
        data.editedAt = new Date()
        FOLLOWS[data.id] = Object.assign({activity: [], posts: []}, FOLLOWS[data.id], data)
        this.clientFn({op: 'replace', path: `/all/${data.id}`, value: FOLLOWS[data.id]})
        this.clientFn({op: 'subscription', follow: FOLLOWS[data.id]})
        break
      case 'remove':
        delete FOLLOWS[data.id]
        this.clientFn({op: 'remove', path: `/all/${data.id}`})
        break
    }
  }
}

module.exports = async function () {
  return new MockStorage()
}
