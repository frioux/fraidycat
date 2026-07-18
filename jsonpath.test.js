//
// jsonpath.test.js
//
// Tests for the in-tree JSONPath evaluator (src/js/jsonpath.js) that replaced
// the `jsonpath` package. The cases mirror the path shapes actually used by
// defs/social.json - dot paths, quoted keys, wildcards, indexes, slices and
// filters - plus the failure mode for syntax outside the supported subset.
//
const test = require('ava')
const jp = require('./src/js/jsonpath')

const doc = {
  title: 'a feed',
  posts: [
    {id: 1, name: 'one', is_pinned: true, bitrate: 832000},
    {id: 2, name: 'two', is_pinned: false, bitrate: 1280000, content_type: 'video/mp4'},
    {id: 3, name: 'three'}
  ],
  users: {
    alice: {login: 'alice', avatar: 'a.png'},
    bob: {login: 'bob', avatar: 'b.png'}
  },
  'weird key': {ok: true},
  range: [17, 25]
}

test('value: returns the first match', t => {
  t.is(jp.value(doc, '$.title'), 'a feed')
  t.is(jp.value(doc, '$.posts.0.name'), 'one')
  t.is(jp.value(doc, '$.range.1'), 25)
})

test('value: returns undefined when nothing matches', t => {
  t.is(jp.value(doc, '$.nope'), undefined)
  t.is(jp.value(doc, '$.posts.9.name'), undefined)
})

test('query: root alone returns the document', t => {
  t.deepEqual(jp.query(doc, '$'), [doc])
})

test('query: dot path returns every match along wildcards', t => {
  t.deepEqual(jp.query(doc, '$.posts.*.name'), ['one', 'two', 'three'])
  t.deepEqual(jp.query(doc, '$.users.*.login'), ['alice', 'bob'])
})

test('query: bracket-quoted keys reach awkward names', t => {
  t.is(jp.value(doc, "$['weird key'].ok"), true)
  t.is(jp.value(doc, '$.users["alice"].avatar'), 'a.png')
})

test('query: numeric indexes, including negative', t => {
  t.is(jp.value(doc, '$.posts[0].id'), 1)
  t.is(jp.value(doc, '$.posts[-1].id'), 3)
})

test('query: slices', t => {
  t.deepEqual(jp.query(doc, '$.posts[-1:].id'), [3])
  t.deepEqual(jp.query(doc, '$.posts[0:2].id'), [1, 2])
  t.deepEqual(jp.query(doc, '$.posts[1:].id'), [2, 3])
})

test('filter: strict comparisons against literals', t => {
  t.deepEqual(jp.query(doc, '$.posts[?(@.is_pinned === true)].id'), [1])
  t.deepEqual(jp.query(doc, '$.posts[?(@.is_pinned !== true)].id'), [2, 3])
  t.is(jp.value(doc, "$.posts[?(@.name === 'two')].id"), 2)
  t.is(jp.value(doc, '$.posts[?(@.bitrate === 832000)].id'), 1)
})

test('filter: || combinations, as in the twitter video rule', t => {
  t.deepEqual(
    jp.query(doc, "$.posts[?(@.bitrate === 832000 || @.content_type === 'video/mp4')].id"),
    [1, 2])
})

test('filter: relational and boolean operators', t => {
  t.deepEqual(jp.query(doc, '$.posts[?(@.id > 1 && @.id <= 2)].id'), [2])
  t.deepEqual(jp.query(doc, '$.posts[?(!@.is_pinned)].id'), [2, 3])
  t.deepEqual(jp.query(doc, '$.posts[?(@.bitrate)].id'), [1, 2])
})

test('filter: over an object filters its values', t => {
  t.deepEqual(jp.query(doc, "$.users[?(@.login === 'bob')].avatar"), ['b.png'])
})

test('missing intermediate keys yield empty results, not errors', t => {
  t.deepEqual(jp.query(doc, '$.users.carol.avatar'), [])
  t.deepEqual(jp.query(doc, '$.posts[?(@.absent === 1)]'), [])
  t.deepEqual(jp.query(null, '$.a'), [])
})

test('unsupported syntax throws loudly', t => {
  t.throws(() => jp.query(doc, '$..name'))
  t.throws(() => jp.query(doc, '$.posts[0,1]'))
  t.throws(() => jp.query(doc, '$.posts[0:2:1]'))
  t.throws(() => jp.query(doc, 'posts.0'))
})
