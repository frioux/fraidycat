//
// src/js/jsonpath.js
//
// A small JSONPath evaluator covering the subset used by the fraidyscrape
// rulesets (defs/social.json): child access ($.a.b, $['a b'], $.a[0],
// negative indexes), wildcards (.* and [*]), slices ([1:3], [-1:]) and
// filters ([?(...)]) built from comparisons (===, !==, ==, !=, <, <=, >,
// >=), !, && and ||, parentheses, string/number/boolean/null literals and
// @-relative paths.
//
// It replaces the `jsonpath` package, which bundles esprima and static-eval;
// static-eval compiles filter expressions through the Function constructor,
// which `web-ext lint` (and AMO review) flag as eval. Unsupported syntax -
// recursive descent (..), unions, slice steps - throws, so a remote ruleset
// that needs more than this subset fails loudly rather than scraping nothing.
//

module.exports = {query, value}

function value (obj, path) {
  return query(obj, path)[0]
}

function query (obj, path) {
  let nodes = [obj]
  for (let seg of parse(path)) {
    let next = []
    for (let node of nodes) {
      if (node != null)
        seg(node, next)
    }
    nodes = next
  }
  return nodes
}

const cache = new Map()

function parse (path) {
  let segs = cache.get(path)
  if (!segs) {
    segs = compile(path)
    cache.set(path, segs)
  }
  return segs
}

function fail (path, why) {
  throw new Error(`Unsupported JSONPath "${path}": ${why}`)
}

function compile (path) {
  if (path[0] !== '$')
    fail(path, 'must start with $')
  let i = 1, segs = []
  while (i < path.length) {
    if (path[i] === '.') {
      i++
      if (path[i] === '.')
        fail(path, 'recursive descent (..) is not supported')
      if (path[i] === '*') {
        i++
        segs.push(wildcard)
      } else {
        let start = i
        while (i < path.length && path[i] !== '.' && path[i] !== '[')
          i++
        if (start === i)
          fail(path, 'empty child name')
        segs.push(child(path.slice(start, i)))
      }
    } else if (path[i] === '[') {
      i++
      if (path[i] === '*') {
        i++
        segs.push(wildcard)
      } else if (path[i] === "'" || path[i] === '"') {
        let [name, end] = readString(path, i)
        i = end
        segs.push(child(name))
      } else if (path[i] === '?') {
        i++
        if (path[i] !== '(')
          fail(path, 'filter must be [?(...)]')
        let depth = 0, start = ++i
        while (i < path.length) {
          let c = path[i]
          if (c === "'" || c === '"') {
            i = readString(path, i)[1]
            continue
          }
          if (c === '(') depth++
          else if (c === ')') {
            if (depth === 0) break
            depth--
          }
          i++
        }
        if (path[i] !== ')')
          fail(path, 'unterminated filter')
        segs.push(filter(compileFilter(path.slice(start, i), path)))
        i++
      } else {
        let start = i
        while (i < path.length && path[i] !== ']')
          i++
        let inner = path.slice(start, i)
        if (inner.includes(','))
          fail(path, 'unions are not supported')
        if (inner.includes(':')) {
          let parts = inner.split(':')
          if (parts.length > 2 && parts[2] !== '')
            fail(path, 'slice steps are not supported')
          segs.push(slice(parts[0] === '' ? 0 : toInt(inner, parts[0], path),
                          parts[1] === '' ? undefined : toInt(inner, parts[1], path)))
        } else {
          toInt(inner, inner, path)
          segs.push(child(inner.trim()))
        }
      }
      if (path[i] !== ']')
        fail(path, 'expected ]')
      i++
    } else {
      fail(path, `unexpected character "${path[i]}"`)
    }
  }
  return segs
}

function toInt (ctx, str, path) {
  let n = Number(str.trim())
  if (!Number.isInteger(n))
    fail(path, `"${ctx}" is not an index or slice`)
  return n
}

// Read a quoted string starting at path[i]; returns [text, index after quote].
function readString (path, i) {
  let quote = path[i], out = ''
  i++
  while (i < path.length && path[i] !== quote) {
    if (path[i] === '\\')
      i++
    out += path[i]
    i++
  }
  if (path[i] !== quote)
    throw new Error(`Unterminated string in JSONPath: ${path}`)
  return [out, i + 1]
}

function child (name) {
  return (node, out) => {
    if (typeof node !== 'object')
      return
    let v = node[name]
    if (v === undefined && Array.isArray(node) && /^-\d+$/.test(name))
      v = node[node.length + Number(name)]
    if (v !== undefined)
      out.push(v)
  }
}

function wildcard (node, out) {
  if (Array.isArray(node))
    out.push(...node)
  else if (typeof node === 'object')
    out.push(...Object.values(node))
}

function slice (start, end) {
  return (node, out) => {
    if (Array.isArray(node))
      out.push(...node.slice(start, end))
  }
}

function filter (test) {
  return (node, out) => {
    if (typeof node !== 'object')
      return
    for (let item of Array.isArray(node) ? node : Object.values(node)) {
      if (test(item))
        out.push(item)
    }
  }
}

//
// Filter expressions: compiled to a predicate over the `@` item with a
// hand-rolled tokenizer and recursive-descent parser - no Function
// constructor anywhere.
//
const OPS = ['===', '!==', '==', '!=', '<=', '>=', '&&', '||', '<', '>', '!', '(', ')']

function compileFilter (src, path) {
  let toks = [], i = 0
  scan:
  while (i < src.length) {
    let c = src[i]
    if (c === ' ' || c === '\t') {
      i++
      continue
    }
    for (let op of OPS) {
      if (src.startsWith(op, i)) {
        toks.push(op)
        i += op.length
        continue scan
      }
    }
    if (c === "'" || c === '"') {
      let [text, end] = readString(src, i)
      toks.push({lit: text})
      i = end
    } else if (c === '@') {
      i++
      let names = []
      while (src[i] === '.' || src[i] === '[') {
        if (src[i] === '.') {
          i++
          let start = i
          while (i < src.length && /[\w$-]/.test(src[i]))
            i++
          names.push(src.slice(start, i))
        } else {
          i++
          if (src[i] !== "'" && src[i] !== '"')
            fail(path, 'only quoted keys allowed in @[...]')
          let [name, end] = readString(src, i)
          names.push(name)
          i = end
          if (src[i] !== ']')
            fail(path, 'expected ] in filter')
          i++
        }
      }
      toks.push({names})
    } else if (/[\d-]/.test(c)) {
      let m = src.slice(i).match(/^-?\d+(\.\d+)?/)
      if (!m)
        fail(path, `bad number in filter at "${src.slice(i)}"`)
      toks.push({lit: Number(m[0])})
      i += m[0].length
    } else if (/[a-z]/.test(c)) {
      let m = src.slice(i).match(/^[a-z]+/)[0]
      if (m === 'true') toks.push({lit: true})
      else if (m === 'false') toks.push({lit: false})
      else if (m === 'null') toks.push({lit: null})
      else fail(path, `unknown word "${m}" in filter`)
      i += m.length
    } else {
      fail(path, `unexpected "${c}" in filter`)
    }
  }

  let pos = 0
  function expect (tok) {
    if (toks[pos] !== tok)
      fail(path, `expected ${tok} in filter`)
    pos++
  }
  function parseOr () {
    let e = parseAnd()
    while (toks[pos] === '||') {
      pos++
      let l = e, r = parseAnd()
      e = item => l(item) || r(item)
    }
    return e
  }
  function parseAnd () {
    let e = parseCmp()
    while (toks[pos] === '&&') {
      pos++
      let l = e, r = parseCmp()
      e = item => l(item) && r(item)
    }
    return e
  }
  function parseCmp () {
    let l = parseUnary()
    let op = toks[pos]
    if (op === '===' || op === '!==' || op === '==' || op === '!=' ||
        op === '<' || op === '<=' || op === '>' || op === '>=') {
      pos++
      let r = parseUnary()
      return item => compare(op, l(item), r(item))
    }
    return l
  }
  function parseUnary () {
    if (toks[pos] === '!') {
      pos++
      let e = parseUnary()
      return item => !e(item)
    }
    return parsePrimary()
  }
  function parsePrimary () {
    let tok = toks[pos]
    if (tok === '(') {
      pos++
      let e = parseOr()
      expect(')')
      return e
    }
    if (tok && tok.names) {
      pos++
      return item => resolve(item, tok.names)
    }
    if (tok && 'lit' in tok) {
      pos++
      return () => tok.lit
    }
    fail(path, 'expected a value in filter')
  }

  let expr = parseOr()
  if (pos !== toks.length)
    fail(path, 'trailing tokens in filter')
  return expr
}

function resolve (item, names) {
  for (let name of names) {
    if (item == null || typeof item !== 'object')
      return undefined
    item = item[name]
  }
  return item
}

function compare (op, l, r) {
  switch (op) {
    case '===': return l === r
    case '!==': return l !== r
    case '==': return l == r
    case '!=': return l != r
    case '<': return l < r
    case '<=': return l <= r
    case '>': return l > r
    case '>=': return l >= r
  }
}
