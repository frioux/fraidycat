//
// Minimal DOM helper: create an element, set attributes, append children
// (strings become text nodes, so pass an <br> element, not "<br>").
//
function el(tag, attrs, ...children) {
  let node = document.createElement(tag)
  if (attrs)
    for (let k in attrs) node.setAttribute(k, attrs[k])
  for (let c of children)
    if (c != null) node.append(c)
  return node
}

let params = new URLSearchParams(location.search)
let feed = params.get("feed")

// The Fraidycat UI is the extension's own bundled page. Point every link
// in the popup at it; getURL() gives a stable chrome-extension:// URL.
const appURL = chrome.runtime.getURL('index.html')
document.getElementById('addlink').href = appURL + '#!/add'
for (let a of document.getElementsByClassName('open'))
  a.href = appURL

chrome.tabs.query({active: true, currentWindow: true}, tabs => {
  let turl = tabs[0].url
  document.getElementById('add').firstChild.href += "?url=" + encodeURIComponent(turl)
  try {
    feed = JSON.parse(feed)
    let card = document.getElementById('card')
    card.replaceChildren()
    if (feed.photos?.avatar) {
      card.append(el('div', {id: 'avatar'}, el('img', {src: feed.photos.avatar})))
    }
    if (feed.title) {
      card.append(el('h1', null, feed.title))
    }
    card.append(el('h2', null, (new URL(turl)).hostname))
    if (feed.description) {
      card.append(el('p', null, feed.description))
    }
    if (feed.sources?.length > 1) {
      for (let i = 0; i < feed.sources.length; i++) {
        let src = feed.sources[i]
        let radio = el('input', {type: 'radio', name: 'sources', value: src.url, id: `source${i}`})
        let label = el('label', {for: `source${i}`}, src.title)
        let span = el('span', null, src.url)
        card.append(el('div', {class: 'source'}, radio, ' ', label, el('br'), span))
      }
    }
    let links = document.getElementsByTagName('a')
    for (let i = 0; i < links.length; i++) {
      links[i].addEventListener('click', e => {
        if (e.target === document.getElementById('addlink')) {
          let radios = document.getElementsByTagName('input')
          for (let j = 0; j < radios.length; j++) {
            if (radios[j].checked) {
              e.target.href = appURL + "#!/add?url=" + radios[j].value
            }
          }
        }
        setTimeout(() => window.close(), 100)
      })
    }
  } catch {}
})
