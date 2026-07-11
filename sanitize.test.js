//
// sanitize.test.js
//
// Tests for the HTML sanitizer (src/js/util.js `sanitize`, which drives
// src/js/sanitize.js). In the app this runs on the browser's native DOM; here
// we provide a DOM with linkedom (dev-only) so the security-critical tag and
// attribute policy has regression coverage. linkedom's HTML parsing is close
// to but not identical to Chrome's, so these assert the sanitizer's *policy*
// (what survives, what is stripped) rather than exact whitespace.
//
const test = require('ava')
const { parseHTML } = require('linkedom')
const { sanitize } = require('./src/js/util')

const BASE = 'https://blog.example.com/post/'

// Build the kind of DocumentFragment parsePost() hands to sanitize().
function clean(html, base = BASE) {
  const { document } = parseHTML('<!DOCTYPE html><html><body>' + html + '</body></html>')
  const frag = document.createDocumentFragment()
  while (document.body.firstChild)
    frag.appendChild(document.body.firstChild)
  return sanitize(frag, base)
}

//
// Dangerous content is removed entirely.
//
test('strips <script> elements', t => {
  t.is(clean('<p>hi</p><script>alert(1)</script>'), '<p>hi</p>')
})

test('strips <style> elements', t => {
  t.is(clean('<p>ok</p><style>body{color:red}</style>'), '<p>ok</p>')
})

test('strips a <script> nested inside allowed markup', t => {
  t.is(clean('<p>before<script>evil()</script>after</p>'), '<p>beforeafter</p>')
})

test('drops event-handler and other unknown attributes', t => {
  let out = clean('<p onclick="evil()" data-x="1" class="y">text</p>')
  t.is(out, '<p>text</p>')
})

//
// Non-whitelisted tags are unwrapped (children kept) or removed if empty.
//
test('unwraps a disallowed container, keeping its text', t => {
  // <form>/<input> are not whitelisted; the text inside survives.
  t.regex(clean('<form><p>kept</p></form>'), /<p>kept<\/p>/)
})

test('removes a disallowed element that has no children', t => {
  t.is(clean('<p>a</p><object data="x"></object><p>b</p>'), '<p>a</p><p>b</p>')
})

//
// Allowed markup is preserved.
//
test('keeps inline formatting', t => {
  t.is(clean('<p><b>bold</b> and <i>it</i></p>'), '<p><b>bold</b> and <i>it</i></p>')
})

//
// Links and media: schemes and dimensions are checked, relatives resolved.
//
test('an https link is kept and opens in a new tab', t => {
  let out = clean('<a href="https://ok.com/page">link</a>')
  t.regex(out, /href="https:\/\/ok\.com\/page"/)
  t.regex(out, /target="_blank"/)
})

test('a relative link is resolved against the base URL', t => {
  let out = clean('<a href="../other">x</a>')
  t.regex(out, /href="https:\/\/blog\.example\.com\/other"/)
})

test('a relative img src is resolved and valid dimensions kept', t => {
  let out = clean('<img src="/pic.png" width="100">')
  t.regex(out, /src="https:\/\/blog\.example\.com\/pic\.png"/)
  t.regex(out, /width="100"/)
})

test('an out-of-range img dimension is dropped', t => {
  // ATTR_DIM only allows 5..500px; 9999 is rejected (attribute omitted).
  let out = clean('<img src="https://ok.com/p.png" width="9999">')
  t.notRegex(out, /width=/)
})

//
// KNOWN GAP (pre-existing, tracked separately): URL schemes without `//`
// - javascript:, data:, vbscript: - miss the allow-list regex in sanitizeAttr
// and fall through the "relative" branch, where new URL() keeps them. These
// `.failing` tests document the desired behavior and will flag when it is
// fixed. See ATTR_HREF / ATTR_SRC in util.js.
//
test.failing('SHOULD strip a javascript: href', t => {
  t.false(clean('<a href="javascript:evil()">x</a>').includes('javascript:'))
})

test.failing('SHOULD strip an iframe with a data: src', t => {
  t.false(clean('<iframe src="data:text/html,<script>evil()</script>"></iframe>').includes('data:'))
})
