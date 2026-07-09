import { h } from 'preact'
import { useState, useRef, useMemo, useLayoutEffect } from 'preact/hooks'
import { followTitle, html2text, house, Importances } from './util'
import { jsonDateParser } from "json-date-parser"
import { Link, Route, Switch, matchPath, location } from './router'
import { store, loadPosts, changeSetting, save, subscribe, confirmRemove,
  importFrom, exportTo } from './store'
import EmojiButton from '@kickscondor/emoji-button'
const frago = require('./frago')
const url = require('url')
import sparkline from './sparkline'

const FormFreeze = (e) => {
  e.preventDefault()
  e.target.querySelectorAll('button').forEach(ele => (ele.disabled = true))
}

const Setting = ({ name, value, children }) => {
  let settings = store.value.settings
  return <a href="#" class={settings[name] === value ? "sel" : undefined}
    onclick={e => {
      e.preventDefault()
      let sort = e.target.closest('div.sort')
      if (sort) sort.classList.remove('show')
      changeSetting({ name, value })
    }}>{children}</a>
}

// Attach hover->'show' toggling (stable ref, so it binds once on mount).
const toggleHoverRef = (el) => {
  if (!el) return
  el.addEventListener('mouseover', () => el.classList.add('show'))
  el.addEventListener('mouseout', () => el.classList.remove('show'))
}

const toggleShowByEle = (ele, parentSel, cls) => {
  let target = ele.closest(parentSel)
  if (target) target.classList.toggle(cls || "show")
}

const toggleShow = (e, parentSel, cls) => {
  e.preventDefault()
  toggleShowByEle(e.target, parentSel, cls)
}

const DragEdge = (e) => {
  e.preventDefault()
  let t = e.target
  t.classList.add('resizing')
  let c = t.parentElement, actualWidth = 0
  let move = ev => {
    if (c) {
      ev.stopPropagation()
      let width = Math.round(document.body.clientWidth - ev.clientX)
      if (width > 64 && width < document.body.clientWidth - 64) {
        actualWidth = width
        c.setAttribute('style', 'width: ' + width + 'px')
      }
    }
  }
  let up = () => {
    if (actualWidth > 0) {
      let value = ((actualWidth / document.body.clientWidth) * 100).toFixed(2) + '%'
      changeSetting({ name: 'pane-width', value })
    }
    t.classList.remove('resizing')
    document.removeEventListener('mousemove', move)
    document.removeEventListener('mouseup', up)
  }
  document.addEventListener('mousemove', move)
  document.addEventListener('mouseup', up)
}

// Widen images/videos wider than 350px once they have dimensions.
const WidenImages = (el) => {
  if (!el) return
  el.querySelectorAll('img').forEach(img => {
    let widen = () => { if (img.naturalWidth > 350) img.classList.add('wide') }
    if (img.naturalWidth == 0) img.addEventListener('load', widen)
    else widen()
  })
  el.querySelectorAll('video').forEach(vid => {
    let widen = () => { if (vid.videoWidth > 350) vid.classList.add('wide') }
    if (vid.videoWidth == 0) vid.addEventListener('load', widen)
    else widen()
  })
}

const FollowForm = ({ follow, isNew }) => {
  const [, bump] = useState(0)
  const picker = useMemo(() => new EmojiButton(), [])
  const followRef = useRef(follow)
  followRef.current = follow
  useLayoutEffect(() => {
    picker.on('emoji', ch => {
      let f = followRef.current
      if (f.tags) { f.tags.push(ch) } else { f.tags = [ch] }
      bump(n => n + 1)
    })
  }, [picker])

  return follow && <form class="follow" onsubmit={FormFreeze}>
    {isNew &&
      <div>
        <label for="url">URL <img src={new URL('../images/supported.png', import.meta.url)} /></label>
        <input type="text" id="url" name="url" value={follow.url} autocorrect="off" autocapitalize="none"
          oninput={e => follow.url = e.target.value} autofocus />
        <p class="note">(See <a href="https://rss.app/">RSS.app</a> and <a href="https://rssbox.herokuapp.com">RSS Box</a> for other services. Or <a href="https://notifier.in/integrations/email-to-rss">Notifier</a> for email newsletters.)</p>
      </div>}

    <div>
      <label for="importance">Importance</label>
      <select id="importance" name="importance" onchange={e => follow.importance = Number(e.target.options[e.target.selectedIndex].value)}>
      {Importances.map(imp =>
        <option value={imp[0]} selected={imp[0] == follow.importance}>{imp[2]} {imp[1]} &mdash; {imp[3]}</option>)}
      </select>
      <p class="note">Only 'Realtime' follows will highlight the tab when there
        are updates.</p>
    </div>

    <div>
      <label for="tags" class="optional">Tag(s) &mdash; separate with spaces</label>
      <input type="text" id="tags" value={follow.tags ? follow.tags.join(' ') : ''}
        oninput={e => e.target.value ? (follow.tags = e.target.value.trim().split(/\s+/)) : (delete follow.tags)} />
      <a href="#" class="emoji" onclick={e => {
        e.preventDefault()
        if (picker.pickerVisible) picker.hidePicker()
        else picker.showPicker(e.target)
      }}>&#128513;</a>
      <p class="note">(If left blank, tag is assumed to be '&#x1f3e0;'&mdash;the main page tag.)</p>
    </div>

    <div>
      <label for="title" class="optional">Title</label>
      <input type="text" id="title" value={follow.title}
        oninput={e => follow.title = e.target.value} />
      <p class="note">(Leave empty to use <em>{follow.actualTitle || "the title loaded from the site"}</em>.)</p>
    </div>

    <button onclick={e => {
      let working = document.getElementById('working')
      if (working) working.setAttribute('style', 'display: block')
      return save(follow)
    }}>Save</button>
    {!isNew && <button type="button" class="delete" onclick={_ => confirmRemove(follow)}>Delete This</button>}

    <div id="working">
      <div>
        <img src={new URL('../images/working.webp', import.meta.url)} />
        <p>FOLLOWING</p>
      </div>
    </div>
  </form>
}

const EditFollowById = ({ match }) => {
  let all = store.value.all
  const follow = useMemo(
    () => JSON.parse(JSON.stringify(all[match.params.id]), jsonDateParser),
    [match.params.id])

  return <div id="edit-feed">
    <h2>Edit a Follow</h2>
    <p>URL: {follow.url}</p>
    <FollowForm follow={follow} isNew={false} />
  </div>
}

const AddFollow = ({ match }) => {
  const follow = useMemo(() => {
    let f = { url: match.params.url, title: match.params.title, importance: 0 }
    if ('tag' in match.params) f.tags = [match.params.tag]
    if ('importance' in match.params) f.importance = Number(match.params.importance)
    return f
  }, [])

  return <div id="add-feed">
    <h2>Add a Follow</h2>
    <p>What blog, wiki or social account do you want to follow?</p>
    <p class="note"><em>This can also be a Twitter or Instagram feed, a YouTube channel, a subreddit, a Soundcloud.</em></p>
    <FollowForm follow={follow} isNew={true} />
  </div>
}

const AddFeed = () => {
  let { list, site } = store.value.feeds
  let actual = list.some(feed => feed.type)
  return <div id="feed-select">
    <h2>Select a Feed</h2>
    <p>{actual ? `${site.url} has several feeds:` :
      `${site.url} has no official feeds, but a few possible feeds were found:`}</p>
    <form class="feeds" onsubmit={FormFreeze}>
    <ul>
    {list.map(feed =>
      <li><input type="checkbox" onclick={e => feed.selected = e.target.checked} value={feed.url} /> {feed.title}<br /><em>{feed.url}</em></li>)}
    </ul>
    <button onclick={_ => subscribe(store.value.feeds)}>Subscribe</button>
    </form>
  </div>
}

function timeAgo(from_time, to_time) {
  if (Number(from_time) == 0)
    return ''

  let from_i = Math.floor(from_time / 1000)
  let to_i = Math.floor(to_time / 1000)
  let mins = Math.round(Math.abs(to_i - from_i)/60)

  if (mins == 0)
    return '1m'
  if (mins >= 1 && mins <= 45)
    return mins + 'm'
  if (mins >= 46 && mins <= 90)
    return '1h'
  if (mins >= 91 && mins <= 1440)
    return Math.round(mins / 60) + 'h'
  if (mins >= 1441 && mins <= 2880)
    return '1d'
  if (mins >= 2881 && mins <= 4320)
    return '2d'
  if (mins >= 4321 && mins <= 525600)
    return from_time.toLocaleString('default',
      {month: 'short', day: 'numeric'})
  return from_time.toLocaleString('default',
    {month: 'short', day: 'numeric', year: 'numeric'})
}

function timeDarkness(from_time, to_time) {
  from_time = Math.floor(from_time / 1000)
  to_time = Math.floor(to_time / 1000)
  let mins = Math.round(Math.abs(to_time - from_time)/60)

	if (mins >= 0 && mins <= 4320)
    return 'age-h'
	if (mins >= 4321 && mins <= 43220)
    return 'age-d'
  return 'age-M'
}

function sparkpoints(el, ary) {
  if (!ary) ary = []
  let points = ary.slice(0, 60), len = 60
  let daily = points.reduce((a, b) => a + b, 0) > 3

  if (daily) {
    len = points.length
  } else {
    for (let i = 0; i < len; i++) {
      let x = i * 3
      points[i] = (ary[x] || 0) + (ary[x + 1] || 0) + (ary[x + 2] || 0)
    }
    if (points.every(x => x == 0))
      len = 0
  }
  el.innerHTML = ''
  el.setAttribute('class', `sparkline sparkline-${daily ? "d" : "w"}`)
  el.setAttribute('width', len * 2)
  el.parentNode.title = `graph of the last ${daily ? 'two' : 'six'} months`
  if (len > 0)
    sparkline(el, points.reverse())
}

const Sparkline = ({ activity }) => {
  const ref = useRef(null)
  useLayoutEffect(() => { if (ref.current) sparkpoints(ref.current, activity) })
  return <svg ref={ref} class="sparkline" width="120" height="20" stroke-width="2"></svg>
}

function lastPostTime(follow, sortPosts) {
  let lastPostAt = new Date(0)
  if (follow.posts instanceof Array) {
    let lastPost = follow.posts[0]
    if (lastPost)
      lastPostAt = lastPost[sortPosts]
  }
  if (follow.status instanceof Array) {
    let lastPost = follow.status[0]
    if (lastPost && lastPost[sortPosts] > lastPostAt)
      lastPostAt = lastPost[sortPosts]
  }
  return lastPostAt
}

const Favicon = function(follow) {
  let src = null
  try { src = url.resolve(follow.url, follow.photo || '/favicon.ico') } catch {}
  return src || (new URL('../images/globe.svg', import.meta.url))
}

const TitleMaxlen = 60, TitleMinlen = 24
const TitleTruncRe = new RegExp(`([-,.!;:)]\\s[^-,.!;:]{0,${TitleMaxlen - TitleMinlen}}|\\s\\S*)$`)
const TitleTrunc = function(title) {
  if (title.length < TitleMaxlen)
    return title
  let res = title.slice(0, TitleMaxlen).match(TitleTruncRe)
  let index = TitleMaxlen
  if (res != null && res.index > TitleMinlen)
    index = res.index + 1
  return <span>{title.slice(0, index)}<s>{title.slice(index)}</s></span>
}

const PostView = (detail, focus, cls) => {
  if (detail) {
    let graphic = null, vid = null, aud = null
    if (!detail.html) {
      if (detail.video) {
        for (let size of ['preview', 'full', 'thumb']) {
          if (size in detail.video) {
            vid = [size, detail.video[size]]
            break
          }
        }
      }
      if (vid === null && detail.graphic) {
        for (let size of ['preview', 'full', 'thumb']) {
          if (size in detail.graphic) {
            graphic = [size, detail.graphic[size]]
            break
          }
        }
      }
      aud = (vid === null && detail.audio && detail.audio.full)
    }

    let author = detail.author && detail.author !== focus.author && <span class="author">{detail.author}</span>
    cls += (detail.text || detail.html) ? ' text' : ''
    return <div class={cls} ref={WidenImages}>
        {vid && <video class={vid[0]} controls><source src={vid[1]} /></video>}
        {graphic && <img class={graphic[0]} src={graphic[1]} />}
        {aud && <audio controls="true" preload="none" src={aud} />}
        {detail.text ? <p>{author}{detail.text}</p> :
          (detail.html && <div>{author}<div class="inner" dangerouslySetInnerHTML={{ __html: detail.html }} /></div>)}
        {detail.embeds && detail.embeds.map(post => PostView(post, focus, "embed"))}
      </div>
  }
}

const paneStyleRef = (el) => {
  // Set the initial pane width once; the drag handle mutates it afterward.
  if (el && !el.style.width)
    el.style.width = store.value.settings['pane-width'] || "50%"
}

const ListFollow = ({ match }) => {
  let follows = store.value
  let now = new Date()
  let tag = match.params.tag ? match.params.tag : house
  let tags = {}, imps = {}
  let sortPosts = follows.settings['mode-updates'] || 'publishedAt'
  let showReposts = follows.settings['mode-reposts'] !== 'hide'
  let viewable = Object.values(follows.all).filter(follow => {
    let ftags = (follow.tags || [house])
    let lastPost = null
    let isShown = ftags.includes(tag) && follow.url && follow.id
    if (isShown) {
      imps[follow.importance] = true
    }
    if (follow.posts instanceof Array && follow.posts[0]) {
      if (isShown) {
        frago.sort(follow, follow.sortBy || sortPosts, showReposts, false)
      }
      lastPost = follow.posts[0]
    }
    ftags.forEach(k => {
      let at = tags[k]
      if (!at)
        tags[k] = at = new Date(0)
      if (lastPost && follow.importance === 0 && at < lastPost[sortPosts])
        tags[k] = lastPost[sortPosts]
    })
    return isShown
  }).sort((a, b) => {
    let sortBy = follows.settings['sort-follows']
    if (sortBy === 'title') {
      sortBy = followTitle(a).localeCompare(followTitle(b))
    } else if (sortBy) {
      sortBy = b[sortBy] > a[sortBy] ? 1 : -1
    } else {
      sortBy = lastPostTime(b, sortPosts) > lastPostTime(a, sortPosts) ? 1 : -1
    }
    return (a.importance - b.importance) || sortBy
  })
	let focus = match.params.meta, focusLimit = Number(match.params.limit || 0)
  let impa = Object.keys(imps)
  let imp = match.params.importance || (impa.length > 0 ? Math.min(...impa) : 0)
  viewable = viewable.filter(follow => (follow.importance == imp))
  let tagTabs = Object.keys(tags).filter(t => t != house).sort()
  tagTabs.unshift(house)
  let addLink = '/add?tag=' + encodeURIComponent(tag) + '&importance=' + imp

  return <div id="follows">
    <div id="tags">
      <ul>
      {tagTabs.map(t => <li class={timeDarkness(tags[t], now)}><Link to={`/tag/${encodeURIComponent(t)}`}
        class={t === tag && 'active'} onclick={e => toggleShowByEle(e.target, "div")}>{t}</Link></li>)}
      </ul>
      <h2><button class={timeDarkness(tags[tag], now)} onclick={e => toggleShow(e, "div")}
         >{tag}</button></h2>
    </div>
    <div class="sort">
      <a href="#" onclick={e => toggleShow(e, "div")}>
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="6" y1="12" x2="21" y2="12"></line>
          <line x1="9" y1="18" x2="21" y2="18"></line>
        </svg>
      </a>
      <div class="drop">
        <ul>
          <li><Setting name="sort-follows">Recent Posts</Setting></li>
          <li><Setting name="sort-follows" value="createdAt">Recently Followed</Setting></li>
          <li class="sep"><Setting name="sort-follows" value="title">A to Z</Setting></li>
          <li><Setting name="mode-updates" value="updatedAt">Show Post Updates</Setting></li>
          <li><Setting name="mode-reposts" value="hide">Hide Reposts</Setting></li>
          <li><Setting name="mode-expand" value="all">Expand All</Setting></li>
          <li class="dark-mode"><Setting name="mode-theme" value="dark">Dark Mode</Setting></li>
          <li class="light-mode"><Setting name="mode-theme" value="light">Light Mode</Setting></li>
          <li><Setting name="mode-tab" value="_blank">Open In New Tab</Setting></li>
        </ul>
      </div>
    </div>
    <div id="imps">
      <ul>
      {Importances.map(sel => (sel[0] == imp ? <li class='active'>{sel[2]} {sel[1]}</li> :
        ((imps[sel[0]] || sel[0] === 0) &&
          <li>{sel[2]} <Link to={`/tag/${encodeURIComponent(tag)}?importance=${sel[0]}`}>{sel[1]}</Link></li>)))}
      </ul>
    </div>
    {viewable.length > 0 ?
      <ol>{viewable.map(follow => {
        try {
          let lastPostAt = lastPostTime(follow, sortPosts)
          let ago = timeAgo(lastPostAt, now)
          let dk = timeDarkness(lastPostAt, now)
          let id = `follow-${follow.id}`
          let viewUrl = `/view/${follow.id}?tag=${encodeURIComponent(tag)}&importance=${encodeURIComponent(imp)}`
          return <li class={`follow ${dk || 'age-X'} ${match.params.id === follow.id ? 'focus' : ''}`}
            onclick={e => {
              // A click anywhere on the row's background toggles the post list.
              // Links (post titles, favicon, title, etc.) navigate as usual.
              if (follow.fetchesContent || e.target.closest('a, button, input, video, audio'))
                return
              let extra = e.target.closest('li.follow').querySelector('.extra')
              if (extra) extra.classList.toggle('trunc')
            }}>
            <a name={id}></a>
            <Link to={viewUrl} class="favicon">
              <img src={Favicon(follow)}
                onerror={e => e.target.src=new URL('../images/globe.svg', import.meta.url)} width="48" height="48" />
            </Link>
            <h3>
              <Link to={viewUrl} class="url">{followTitle(follow)}</Link>
              <Link class="ext" to={follow.url} target="_blank"><img src={new URL('../images/link.svg', import.meta.url)} width="16" target="_blank" /></Link>
              {follow.status instanceof Array && follow.status.map(st =>
                <a class={`status status-${st.type}`} ref={toggleHoverRef} href={st.url || follow.url} target="_blank"
                  >{st.type === 'live' ? <span><img src={new URL('../images/rec.svg', import.meta.url)} width="12" /> LIVE</span> : <span><img src={new URL('../images/notepad.svg', import.meta.url)} width="16" /></span>}
                  <div>{st.title || st.text || html2text(st.html || '')}
                    {st[sortPosts] && <span class="ago">{timeAgo(st[sortPosts], now)}</span>}</div>
                </a>)}
              {ago && <span class="latest">{ago}</span>}
              <a><Sparkline activity={follow.activity} /></a>
              <Link to={`/edit/${follow.id}`} class="edit" title="edit"><img src={new URL('../images/270f.png', import.meta.url)} /></Link>
            </h3>
            <div class={`extra ${follows.settings['mode-expand'] || "trunc"}`}>
              <div class="post">
                <ol class="title">
                {follow.posts instanceof Array && follow.posts.length > 0 &&
                  (showReposts ? follow.posts : follow.posts.filter(x => !x.author || x.author === follow.author)).
                    slice(0, follow.limit || 10).map(f => {
                      return <li class={timeDarkness(f[sortPosts], now)}>
                        {f.author && f.author !== follow.author && <span class="author">{f.author}</span>}
                        {f.url.startsWith('id:') ? <span class="txt">{TitleTrunc(f.title)}</span> : <a href={f.url}>{TitleTrunc(f.title)}</a>}
                        {!f.index && <span class="ago">{timeAgo(f[sortPosts], now)}</span>}
                      </li>
                  })}
                </ol>
              </div>
            </div>
          </li>
        } catch (e) {
          console.error(e)
          return <li><h3>{followTitle(follow) || follow.id}
            <Link to={`/edit/${follow.id}`} class="edit" title="edit"><img src={new URL('../images/270f.png', import.meta.url)} /></Link>
          </h3></li>
        }
      })}</ol> :
        <div class="intro">
          <h3>Ready?</h3>
          <p>Let's get Fraidycat going, yeah?</p>
          <p>Click the <Link to={addLink} class="pink" title="Add a Follow"><img src={new URL('../images/add.svg', import.meta.url)} width="16" /></Link> button to add someone!</p>
          <p>Or, click the <Link to="/settings" title="Settings"><img src={new URL('../images/gear.svg', import.meta.url)} width="16" /></Link> to import a bunch.</p>
          <p><em>Hey! Follows added to this <strong>Realtime</strong> page will highlight the tab when there are new posts!</em></p>
        </div>}
    {focus && <div id="pane" ref={paneStyleRef}>
      <div class="hide"><Link to={`/tag/${encodeURIComponent(tag)}?importance=${imp}`}>
        <img src={new URL('../images/hide.svg', import.meta.url)} width="24" /></Link></div>
      <div class="edge" onmousedown={DragEdge} />
      <div class="contents">
      {focus.posts.slice(focusLimit, focusLimit + 20).map(post => {
        let detail = focus.details[post.id]
        if (detail) {
          return <div id={`post-${post.id}`} class="post">
            {detail.title && <h4><a href={detail.url} target="_blank">{detail.title}</a>
              <nobr><a class="ext" href={detail.url} target="_blank">
                <img src={new URL('../images/link.svg', import.meta.url)} width="16" target="_blank" />
              </a></nobr>
              </h4>}
            {PostView(detail, focus, "main")}
            <div class={timeDarkness(detail.publishedAt, now)}>
              {detail.publishedAt && <span class="ago">{timeAgo(detail.publishedAt, now)}</span>}
              <Link to={detail.url} class="share" target="_blank">
                <img src={new URL('../images/share.svg', import.meta.url)} width="12" />
              </Link>
            </div>
          </div>
        }
      })}
      {(focus.posts.length > focusLimit + 20) && <div id="nextPage"><p><Link
        to={`/view/${focus.id}?tag=${encodeURIComponent(tag)}&importance=${encodeURIComponent(imp)}&limit=${focusLimit + 20}`}>View older posts</Link></p>
        </div>}
      </div>
    </div>}
  </div>
}

const ViewFollowById = ({ match, location }) => {
  let follows = store.value
  useLayoutEffect(() => {
    loadPosts(match.params.id)
    let contents = document.querySelector('#pane .contents')
    if (contents) contents.scrollTop = 0
  }, [match.params.id])

  if (follows.focus) {
    let tag = follows.focus.tags && follows.focus.tags[0]
    match.params = Object.assign({meta: follows.focus, tag,
      importance: follows.focus.importance}, match.params)
  }

  return ListFollow({ match, location })
}

const ImportFrom = (format) => {
  let imp = document.getElementById('fileImp')
  imp.name = format
  imp.click()
}

const ChangeSettings = () => {
  return <div id="settings">
    <div class="about">
      <a href="https://fraidyc.at/"><img src={new URL('../images/flatcat-512.png', import.meta.url)} alt="Fraidycat" title="Fraidycat" /></a>
      <h2><a href="https://fraidyc.at/">fraidyc.at</a></h2>
      <p>Follow the <em>whole</em> Web.</p>
      <p class="report">Report bugs and ideas <a href="https://github.com/kickscondor/fraidycat/issues">here</a>.</p>
    </div>
    <form onsubmit={e => e.preventDefault()}>
    <input type="file" id="fileImp" style="display: none" name=""
      onchange={e => importFrom(e)} />
    <h3>Import / Export</h3>
    <div>
      <p><strong>JSON:</strong>
        <button onclick={e => ImportFrom('json')}>Full Import</button>
        <button onclick={e => exportTo('json')}>Full Export</button></p>
      <p class="note">This will save <em>all</em> of your Fraidycat settings.</p>
    </div>
    <div>
      <p>
        <strong>OPML:</strong>
        <button onclick={e => ImportFrom('opml')}>Import Follows</button>
        <button onclick={e => exportTo('opml')}>Export Follows</button>
      </p>
      <p class="note">This will only backup your follows.</p>
    </div>
    <div>
      <p>
        <strong>HTML:</strong>
        <button onclick={e => exportTo('html')}>Export Follows</button>
      </p>
      <p class="note">This is just for fun - a bookmarks list in HTML.</p>
    </div>
    </form>
  </div>
}

export const App = () => {
  let follows = store.value
  let loc = location.value
  let settings = window.location.pathname === "/settings.html"
  if (!follows.started)
    return <div id="scanner">
      <div id="logo">
        <img src={new URL('../images/fc.png', import.meta.url)} />
      </div>
      <div id="loading">
        <img src={new URL('../images/catspace.webp', import.meta.url)} alt="..." />
        <p>LOADING</p>
      </div>
    </div>

  //
  // Report progress on follows that are currently updating.
  //
  let upd = follows.updating || {}, urgent = follows.urgent
  let updDone = 0, updTotal = 0, note = null, last = new Date()
  for (let id in upd) {
    let f = upd[id]
    updTotal++
    if (f.done) {
      updDone++
    } else if (!note || f.startedAt < last) {
      note = id.substring(0, id.length - 9)
      last = f.startedAt
    }
  }

  let logo = new URL('../images/fc.png', import.meta.url)
  if (follows.settings['mode-theme'] === 'dark') {
    logo = new URL('../images/fc-cy.png', import.meta.url)
  }

  // Add-follow link carries the currently-viewed tag/importance (this replaced
  // an imperative DOM patch of the header link in the Hyperapp version).
  let tagMatch = matchPath('/tag/:tag', loc)
  let curTag = tagMatch ? tagMatch.params.tag : house
  let curImp = matchPath('', loc).params.importance || 0
  let addLink = `/add?tag=${encodeURIComponent(curTag)}&importance=${curImp}`

  return <div class={`theme--${follows.settings['mode-theme'] || "auto"}`}>
    <article>
      <header>
        <div id="menu">
          {!settings && <ul>
            {updTotal > 2 ?
              <li id="notice">
                <div class="progress"><div style={`width: ${Math.round((updDone / updTotal) * 100)}%`}></div></div>
                <p>{note}</p>
              </li> :
              (urgent && <li id="urgent"><p><a href="#" onclick={e => {
                e.preventDefault(); urgent.approve()}}>{urgent.note}</a></p></li>)}
            <li><Link to={addLink} class="pink" title="Add a Follow"><img src={new URL('../images/add.svg', import.meta.url)} width="16" /></Link></li>
            <li><Link to="/settings" title="Settings"><img src={new URL('../images/gear.svg', import.meta.url)} width="16" /></Link></li>
          </ul>}
        </div>
        <h1><Link to="/"><img src={logo} alt="Fraidycat" title="Fraidycat" /></Link></h1>
      </header>
      <section>
        <Switch>
          <Route path="/settings" render={ChangeSettings} />
          <Route path="/add" render={AddFollow} />
          <Route path="/add-feed" render={AddFeed} />
          <Route path="/edit/:id" render={EditFollowById} />
					<Route path="/view/:id" render={ViewFollowById} />
          <Route path="/tag/:tag" render={ListFollow} />
          <Route render={settings ? ChangeSettings : ListFollow} />
        </Switch>
      </section>
    </article>
  </div>
}
