/*
 * Post-build sanitizer for the web-extension bundle.
 *
 * Chrome loads content scripts by reading the file and running it through
 * base::IsStringUTF8, which is STRICTER than a plain UTF-8 decode: it rejects
 * lone surrogates and Unicode "non-characters" (U+FDD0-U+FDEF and any code
 * point whose low 16 bits are 0xFFFE/0xFFFF, e.g. U+FFFF). If any of these
 * bytes appear in a content-script file, Chrome refuses the whole extension
 * with "It isn't UTF-8 encoded."
 *
 * These bytes sneak in via minification: source like `'￿'` (a common
 * IndexedDB prefix-range upper bound, used by emoji-picker-element) is a
 * perfectly legal escape, but swc/terser decode it into the raw U+FFFF
 * character in the output. Re-escaping it back to `￿` is byte-for-byte
 * equivalent at runtime (same single UTF-16 code unit) but keeps the file
 * ASCII where it matters, so Chrome accepts it.
 *
 * This module is pure/testable (escapeIllegal, findIllegal) with a thin CLI
 * that walks the built extension and rewrites offending .js files in place.
 */
'use strict'

const fs = require('fs')
const path = require('path')

// A Unicode non-character: the FDD0-FDEF block, or U+xFFFE / U+xFFFF in any
// plane. `cp` is a full code point (post surrogate-pair decoding).
function isNonCharacter (cp) {
  if (cp >= 0xfdd0 && cp <= 0xfdef) return true
  return (cp & 0xfffe) === 0xfffe
}

// `\uXXXX` escape for a single UTF-16 code unit.
function esc (unit) {
  return '\\u' + unit.toString(16).padStart(4, '0')
}

// Report every offending UTF-16 code unit in `input` (index + reason). Used by
// tests and by the CLI to explain what it changed. Valid surrogate pairs that
// form a normal (non-"non-character") code point are NOT reported.
function findIllegal (input) {
  const out = []
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = input.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        const cp = (c - 0xd800) * 0x400 + (next - 0xdc00) + 0x10000
        if (isNonCharacter(cp)) {
          out.push({ index: i, unit: c, reason: 'non-character' })
          out.push({ index: i + 1, unit: next, reason: 'non-character' })
        }
        i++ // consumed a valid or handled pair; skip the low surrogate
        continue
      }
      out.push({ index: i, unit: c, reason: 'lone-high-surrogate' })
      continue
    }
    if (c >= 0xdc00 && c <= 0xdfff) {
      out.push({ index: i, unit: c, reason: 'lone-low-surrogate' })
      continue
    }
    if (isNonCharacter(c)) {
      out.push({ index: i, unit: c, reason: 'non-character' })
    }
  }
  return out
}

// Return `input` with every Chrome-illegal code unit replaced by an equivalent
// `\uXXXX` escape. Valid surrogate pairs (real astral characters like emoji)
// are left untouched, so ordinary text is unchanged.
function escapeIllegal (input) {
  const bad = findIllegal(input)
  if (bad.length === 0) return input
  const byIndex = new Map(bad.map(b => [b.index, b.unit]))
  let out = ''
  for (let i = 0; i < input.length; i++) {
    out += byIndex.has(i) ? esc(byIndex.get(i)) : input[i]
  }
  return out
}

// Walk `dir` recursively and rewrite any *.js file that contains illegal code
// units. Returns the list of { file, count } that were changed.
function sanitizeDir (dir) {
  const changed = []
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.name.endsWith('.js')) {
        const original = fs.readFileSync(full, 'utf8')
        const bad = findIllegal(original)
        if (bad.length > 0) {
          fs.writeFileSync(full, escapeIllegal(original))
          changed.push({ file: full, count: bad.length })
        }
      }
    }
  }
  walk(dir)
  return changed
}

module.exports = { isNonCharacter, findIllegal, escapeIllegal, sanitizeDir }

if (require.main === module) {
  const dir = process.argv[2] || path.join('build', 'webext')
  if (!fs.existsSync(dir)) {
    console.error(`sanitize-webext-encoding: directory not found: ${dir}`)
    process.exit(1)
  }
  const changed = sanitizeDir(dir)
  if (changed.length === 0) {
    console.log(`sanitize-webext-encoding: ${dir} already clean`)
  } else {
    for (const { file, count } of changed) {
      console.log(`sanitize-webext-encoding: escaped ${count} illegal code unit(s) in ${file}`)
    }
  }
}
