//
// safehref.test.js
//
// Tests for src/js/util.js `safeHref`, which vets a scraped URL before it is
// bound to an <a href> in the Preact views (view.js). Unlike the HTML
// sanitizer, these hrefs bypass sanitize() entirely, so safeHref is the only
// thing standing between a malicious scraped URL and a rendered javascript:
// link.
//
const test = require('ava')
const { safeHref } = require('./src/js/util')

//
// Safe schemes pass through unchanged.
//
test('keeps an https URL', t => {
  t.is(safeHref('https://ok.com/page'), 'https://ok.com/page')
})

test('keeps an http URL', t => {
  t.is(safeHref('http://ok.com/page'), 'http://ok.com/page')
})

test('keeps a mailto: URL', t => {
  t.is(safeHref('mailto:hi@example.com'), 'mailto:hi@example.com')
})

test('keeps an ftp: URL', t => {
  t.is(safeHref('ftp://files.example.com/x'), 'ftp://files.example.com/x')
})

test('keeps a hyper: URL', t => {
  t.is(safeHref('hyper://abcdef/'), 'hyper://abcdef/')
})

//
// A value with no scheme is a relative URL; it cannot be javascript: and is
// kept as-is.
//
test('keeps a relative URL', t => {
  t.is(safeHref('/some/path'), '/some/path')
})

//
// Dangerous schemes are rejected (undefined -> Preact drops the attribute).
//
test('rejects a javascript: URL', t => {
  t.is(safeHref('javascript:alert(1)'), undefined)
})

test('rejects a data: URL', t => {
  t.is(safeHref('data:text/html,<script>evil()</script>'), undefined)
})

test('rejects a vbscript: URL', t => {
  t.is(safeHref('vbscript:msgbox(1)'), undefined)
})

//
// Whitespace and control-character obfuscation of a dangerous scheme is
// handled by native URL parsing, not brittle regexes.
//
test('rejects javascript: with an embedded tab', t => {
  t.is(safeHref('java\tscript:alert(1)'), undefined)
})

test('rejects javascript: with an embedded newline', t => {
  t.is(safeHref('java\nscript:alert(1)'), undefined)
})

test('rejects javascript: with leading whitespace', t => {
  t.is(safeHref('  javascript:alert(1)'), undefined)
})

//
// Non-string / empty inputs yield undefined rather than throwing.
//
test('returns undefined for undefined', t => {
  t.is(safeHref(undefined), undefined)
})

test('returns undefined for null', t => {
  t.is(safeHref(null), undefined)
})
