/*
 * Post-build fix for the web-extension bundle.
 *
 * Parcel 2.14+ injects an inline `<script type=importmap>` into built HTML
 * entries. Extension pages run under the MV3 content security policy
 * `script-src 'self'`, which forbids ALL inline scripts — import maps
 * included — so Chrome blocks the tag with "Executing inline script violates
 * the following Content Security Policy directive" and MV3 offers no way to
 * allow it (hashes and nonces are rejected for extension pages).
 *
 * The map is redundant here anyway: Parcel's JS runtime carries its own copy
 * of the same id → hashed-filename mappings (via `parcelRequire.extendImportMap`)
 * and resolves asset URLs through that before ever consulting the browser.
 * The HTML import map only matters for native dynamic `import("publicId")`
 * calls, which this build does not emit.
 *
 * So: strip the inline import map from every built HTML file — but first
 * verify no built JS actually imports one of the mapped ids natively, and
 * refuse to strip (failing the build loudly) if one ever does.
 *
 * This module is pure/testable (stripImportMaps, findNativeImports) with a
 * thin CLI that rewrites the built extension's .html files in place.
 */
'use strict'

const fs = require('fs')
const path = require('path')

const IMPORTMAP_RE = /<script\s+type=["']?importmap["']?\s*>(.*?)<\/script>/gis

// Remove every inline import-map script from `html`. Returns the cleaned
// markup plus the ids each removed map declared, so the caller can verify
// nothing still depends on them.
function stripImportMaps (html) {
  const ids = []
  const out = html.replace(IMPORTMAP_RE, (_, json) => {
    try {
      ids.push(...Object.keys(JSON.parse(json).imports || {}))
    } catch (e) {
      // Unparseable map: still strip it (it's inline, so CSP blocks it
      // regardless), just with no ids to guard.
    }
    return ''
  })
  return { html: out, ids }
}

// Report any native dynamic `import("<id>")` of a mapped id in `js`. Such a
// call resolves through the browser's import map, so stripping the map would
// break it — the CLI treats any hit as a build error.
function findNativeImports (js, ids) {
  return ids.filter(id =>
    js.includes(`import("${id}")`) || js.includes(`import('${id}')`))
}

// Strip the import maps from every .html under `dir`, after checking every
// .js under `dir` for native imports of the mapped ids. Returns the list of
// { file, ids } that were changed; throws if a native import needs the map.
function stripDir (dir) {
  const htmlFiles = []
  const jsFiles = []
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.html')) htmlFiles.push(full)
      else if (entry.name.endsWith('.js')) jsFiles.push(full)
    }
  }
  walk(dir)

  const stripped = []
  for (const file of htmlFiles) {
    const original = fs.readFileSync(file, 'utf8')
    const { html, ids } = stripImportMaps(original)
    if (html !== original) stripped.push({ file, html, ids })
  }

  const allIds = [...new Set(stripped.flatMap(s => s.ids))]
  for (const file of jsFiles) {
    const needed = findNativeImports(fs.readFileSync(file, 'utf8'), allIds)
    if (needed.length > 0) {
      throw new Error(`${file} natively imports mapped id(s) ${needed.join(', ')}; ` +
        'the import map cannot be stripped — this needs a different CSP fix')
    }
  }

  for (const s of stripped) fs.writeFileSync(s.file, s.html)
  return stripped.map(({ file, ids }) => ({ file, ids }))
}

module.exports = { stripImportMaps, findNativeImports, stripDir }

if (require.main === module) {
  const dir = process.argv[2] || path.join('build', 'webext')
  if (!fs.existsSync(dir)) {
    console.error(`strip-inline-importmap: directory not found: ${dir}`)
    process.exit(1)
  }
  let changed
  try {
    changed = stripDir(dir)
  } catch (e) {
    console.error(`strip-inline-importmap: ${e.message}`)
    process.exit(1)
  }
  if (changed.length === 0) {
    console.log(`strip-inline-importmap: ${dir} already clean`)
  } else {
    for (const { file, ids } of changed) {
      console.log(`strip-inline-importmap: removed inline import map (${ids.length} entries) from ${file}`)
    }
  }
}
