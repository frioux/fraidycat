/*
 * Derive a Firefox-flavored copy of the built extension for `web-ext lint`.
 *
 * The manifest needs of Chrome and Firefox conflict: Chrome wants only
 * `background.service_worker` and warns at load time about `background.scripts`
 * ("requires manifest version of 2 or lower") and other Firefox-only keys,
 * while addons-linter errors on a service worker with no `background.scripts`
 * fallback and requires a gecko add-on ID in MV3. So build/webext stays a
 * native Chrome extension, and this script copies it to build/webext-firefox
 * with the manifest rewritten for Firefox:
 *
 *   - background becomes `scripts` (pointing at the same built bundle);
 *     declaring only `scripts` also avoids the linter's "service_worker is
 *     ignored by Firefox" warning.
 *   - browser_specific_settings supplies the gecko add-on ID (required in
 *     MV3, and storage.sync needs it) and the data-collection disclosure.
 */
'use strict'

const fs = require('fs')
const path = require('path')

function firefoxManifest (manifest) {
  const out = { ...manifest }
  out.background = { scripts: [manifest.background.service_worker] }
  out.browser_specific_settings = {
    gecko: {
      id: 'scaredycat@frew.co',
      data_collection_permissions: {
        required: ['none']
      }
    }
  }
  return out
}

module.exports = { firefoxManifest }

if (require.main === module) {
  const src = process.argv[2] || path.join('build', 'webext')
  const dest = process.argv[3] || path.join('build', 'webext-firefox')
  if (!fs.existsSync(path.join(src, 'manifest.json'))) {
    console.error(`make-firefox-webext: no manifest in ${src}`)
    process.exit(1)
  }
  fs.rmSync(dest, { recursive: true, force: true })
  fs.cpSync(src, dest, { recursive: true })
  const manifest = JSON.parse(fs.readFileSync(path.join(src, 'manifest.json'), 'utf8'))
  fs.writeFileSync(path.join(dest, 'manifest.json'),
    JSON.stringify(firefoxManifest(manifest), null, 2))
  console.log(`make-firefox-webext: wrote ${dest}`)
}
