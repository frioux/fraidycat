const test = require('ava')
const fs = require('fs')
const path = require('path')
const {
  isNonCharacter,
  findIllegal,
  escapeIllegal,
} = require('./scripts/sanitize-webext-encoding')

//
// Unit tests for the encoding sanitizer. These guard the logic that keeps
// Chrome from rejecting the content-script bundle with "It isn't UTF-8
// encoded" (Chrome runs base::IsStringUTF8, which rejects lone surrogates and
// Unicode non-characters even though they decode fine as UTF-8).
//

test('isNonCharacter flags U+FFFF, U+FFFE, and the FDD0-FDEF block', t => {
  t.true(isNonCharacter(0xffff))
  t.true(isNonCharacter(0xfffe))
  t.true(isNonCharacter(0xfdd0))
  t.true(isNonCharacter(0xfdef))
  t.true(isNonCharacter(0x1fffe)) // non-character in a higher plane
  t.false(isNonCharacter(0x0041)) // 'A'
  t.false(isNonCharacter(0xfeff)) // BOM / ZWNBSP is a legal character
  t.false(isNonCharacter(0x7ffe))
})

test('escapeIllegal escapes a raw U+FFFF (the emoji-picker IDBKeyRange bug)', t => {
  const raw = 'IDBKeyRange.bound(n,n+"￿",!1,!0)'
  const fixed = escapeIllegal(raw)
  t.false(fixed.includes('￿'), 'raw non-character removed')
  t.true(fixed.includes('\\uffff'), 'replaced with an ASCII escape')
  // The escape is byte-for-byte an equivalent JS string literal.
  t.is(JSON.parse('"\\uffff"'), '￿')
})

test('escapeIllegal escapes lone surrogates and non-characters', t => {
  t.is(escapeIllegal('a\uD800b'), 'a\\ud800b') // lone high surrogate
  t.is(escapeIllegal('a\uDC00b'), 'a\\udc00b') // lone low surrogate
  t.is(escapeIllegal('a￾b'), 'a\\ufffeb') // non-character
  t.is(escapeIllegal('a﷐b'), 'a\\ufdd0b') // non-character
})

test('escapeIllegal leaves valid text and emoji (surrogate pairs) untouched', t => {
  t.is(escapeIllegal('Follow from afar — café 123'), 'Follow from afar — café 123')
  t.is(escapeIllegal('a 😺 b'), 'a 😺 b') // U+1F63A is a legal astral char
  t.is(escapeIllegal(''), '')
  t.is(findIllegal('a 😺 b Follow 123').length, 0)
})

test('escapeIllegal is idempotent', t => {
  const once = escapeIllegal('x￿y\uD800z')
  t.is(escapeIllegal(once), once)
})

//
// Build-output validation. These run against build/webext when it exists (a
// release build, or after `npm run webext`); they are skipped otherwise so a
// plain `npm test` on a fresh checkout doesn't fail for lack of a build.
//

const BUILD = path.join(__dirname, 'build', 'webext')
const MANIFEST = path.join(BUILD, 'manifest.json')
const hasBuild = fs.existsSync(MANIFEST)
const buildTest = hasBuild ? test : test.skip

if (!hasBuild) {
  test('web-extension build validation (skipped: run `npm run webext` first)', t => {
    t.pass()
  })
}

function listJsFiles (dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listJsFiles(full))
    else if (entry.name.endsWith('.js')) out.push(full)
  }
  return out
}

// Gather the load-critical file references from a manifest: the resources whose
// absence actually stops the extension (or a page) from loading. Deliberately
// excludes web_accessible_resources, which Chrome does not validate at load
// time and which Parcel is known to over-generate.
function loadCriticalPaths (manifest) {
  const paths = []
  const addIconMap = (m) => { if (m) paths.push(...Object.values(m)) }
  for (const cs of manifest.content_scripts || []) {
    paths.push(...(cs.js || []), ...(cs.css || []))
  }
  if (manifest.background && manifest.background.service_worker) {
    paths.push(manifest.background.service_worker)
  }
  addIconMap(manifest.icons)
  if (manifest.action) {
    if (typeof manifest.action.default_icon === 'string') paths.push(manifest.action.default_icon)
    else addIconMap(manifest.action.default_icon)
    if (manifest.action.default_popup) paths.push(manifest.action.default_popup)
  }
  if (manifest.options_ui && manifest.options_ui.page) paths.push(manifest.options_ui.page)
  return [...new Set(paths)]
}

buildTest('manifest.json is valid JSON with the expected shape', t => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  t.is(manifest.manifest_version, 3)
  t.truthy(manifest.name)
  t.truthy(manifest.version)
  t.true(Array.isArray(manifest.content_scripts))
  t.truthy(manifest.background && manifest.background.service_worker)
})

buildTest('every load-critical file referenced by the manifest exists', t => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  const refs = loadCriticalPaths(manifest)
  t.true(refs.length > 0, 'sanity: found file references to check')
  for (const ref of refs) {
    t.true(fs.existsSync(path.join(BUILD, ref)), `missing referenced file: ${ref}`)
  }
})

buildTest('content-script JS files exist and are Chrome-valid UTF-8', t => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  const scripts = manifest.content_scripts.flatMap(cs => cs.js || [])
  t.true(scripts.length > 0, 'sanity: found content scripts')
  for (const rel of scripts) {
    const full = path.join(BUILD, rel)
    t.true(fs.existsSync(full), `missing content script: ${rel}`)
    const bad = findIllegal(fs.readFileSync(full, 'utf8'))
    t.is(bad.length, 0, `${rel} has Chrome-illegal code units: ${JSON.stringify(bad.slice(0, 3))}`)
  }
})

buildTest('no built JS file contains Chrome-illegal code units', t => {
  const offenders = []
  for (const file of listJsFiles(BUILD)) {
    const bad = findIllegal(fs.readFileSync(file, 'utf8'))
    if (bad.length > 0) offenders.push(`${path.relative(BUILD, file)} (${bad.length})`)
  }
  t.deepEqual(offenders, [], `illegal code units found in: ${offenders.join(', ')}`)
})

//
// The Firefox manifest derivation (scripts/make-firefox-webext.js). Chrome
// warns at load time about Firefox-only manifest keys, so build/webext stays
// pure Chrome and the lint target gets this rewritten copy.
//
const { firefoxManifest } = require('./scripts/make-firefox-webext')

test('firefoxManifest swaps the service worker for background.scripts', t => {
  const ff = firefoxManifest({ name: 'x', background: { service_worker: 'background.abc123.js' } })
  t.deepEqual(ff.background, { scripts: ['background.abc123.js'] })
  t.is(ff.background.service_worker, undefined)
})

test('firefoxManifest adds the gecko ID and data-collection disclosure', t => {
  const ff = firefoxManifest({ background: { service_worker: 'bg.js' } })
  t.is(ff.browser_specific_settings.gecko.id, 'scaredycat@frew.co')
  t.deepEqual(ff.browser_specific_settings.gecko.data_collection_permissions, { required: ['none'] })
})

test('firefoxManifest leaves the source manifest untouched', t => {
  const src = { name: 'x', background: { service_worker: 'bg.js' } }
  firefoxManifest(src)
  t.deepEqual(src, { name: 'x', background: { service_worker: 'bg.js' } })
})
