//
// src/js/router-match.js
//
// Pure hash-route parsing and matching - no DOM or framework dependencies, so
// it can be unit-tested directly (see test.js). router.js wires these to a
// signal and the window's hashchange event.
//
function decode(s) {
  try { return decodeURIComponent(s) } catch { return s }
}

// "#!/tag/comics?importance=1" -> { pathname: "/tag/comics", search: "importance=1" }
function parseHash(hash) {
  let raw = hash && hash.startsWith('#!') ? hash.slice(2) : ''
  raw = raw || '/'
  let search = '', qi = raw.indexOf('?')
  if (qi >= 0) {
    search = raw.slice(qi + 1)
    raw = raw.slice(0, qi)
  }
  return { pathname: raw, search, hashRouting: true }
}

function parseQuery(search) {
  let out = {}
  if (search) {
    for (let pair of search.split('&')) {
      let i = pair.indexOf('=')
      let k = i < 0 ? pair : pair.slice(0, i)
      let v = i < 0 ? undefined : pair.slice(i + 1)
      if (k) out[decode(k)] = v === undefined ? undefined : decode(v)
    }
  }
  return out
}

const stripTrailing = s => s.replace(/\/+$/, '')

//
// Match a route pattern (e.g. "/tag/:tag") against a location. Returns
// { isExact, path, params } or null; params merges query values with any
// :named path segments.
//
function matchPath(pattern, loc) {
  let params = parseQuery(loc.search)
  if (!pattern || pattern === loc.pathname)
    return { isExact: pattern === loc.pathname, path: loc.pathname, params }

  let pat = stripTrailing(pattern).split('/')
  let seg = stripTrailing(loc.pathname).split('/')
  if (pat.length > seg.length) return null
  for (let i = 0; i < pat.length; i++) {
    if (pat[i][0] === ':') params[pat[i].slice(1)] = decode(seg[i])
    else if (pat[i] !== seg[i]) return null
  }
  return { isExact: false, path: loc.pathname, params }
}

module.exports = { parseHash, parseQuery, matchPath }
