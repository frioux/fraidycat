                             /||
                             \ \\
            ,_       _,     _/ //
            |\\_____/||----- ____\
            |        |_------     |  :. :.
            |  {}{}  |            |
            |  =v=   |        ___ |  scaredycat
            |   ^    | _------ | ||
            | ,----, ||    ||| | ||  follow from afar
            | ||   | ||    ||| | ||
            | ||   | ||    ||' | ||  ~ blogs, wikis ~
            | ||   | ||        '-'      ~ twitter, reddit, insta, yt, etc ~
            | ||   | ||
            '-''   '-''                            :. :.

**Scaredycat** is a browser extension (Chrome/Firefox, Manifest V3) for
following folks on a variety of platforms. But rather than showing you a
traditional 'inbox' or 'feed' view of all the incoming posts - Scaredycat
braces itself against this unbridled firehose! - you are shown an overview
of who is active and a brief summary of their activity.

It is a fork of [Kicks Condor's Fraidycat](https://github.com/kickscondor/fraidycat).

There are no fancy algorithms - everything is organized by recency. You
sort follows into tags and importance ("do I want to track this person in
real-time? Is this a band that I am only interested in checking in on once
a year?") For once, the point isn't for the tool to discern your intent
from your behavior; the point is for you to *wield* the tool.

## Features

Follows are arranged by tag - each can have multiple tags - the tabbed bar
along the top of the main page lets you select the tag to view. You then
narrow down by importance: 'real-time', 'daily', 'weekly', 'monthly' or
'yearly'. Real-time follows are checked every 5-10 minutes, daily every
1-2 hours, and the rest at least once a day.

### Follow Support

* **Feeds (RSS, Atom, JSON Feed).** Any feeds attached to the URL you
  supply are discovered automatically, so most sites just work.
* **TiddlyWiki.** The entire wiki is read every time it changes.
* **Pinboard, YouTube and Reddit.** Their feeds aren't discoverable, so
  there is some logic to figure them out for you.
* **Twitch, Twitter, Instagram, Facebook, SoundCloud, Bandcamp,
  Kickstarter, Patreon, Pinterest, Tumblr, Steam, Are.na** and more!

## Installation

Clone the repo, then:

    npm install
    npm run webext

The unpacked extension is written to `build/webext`. In Chrome, visit
`chrome://extensions`, enable "Developer mode", and "Load unpacked" that
directory. To lint the build, run `npm run webext:lint`.

For UI work without loading the extension, `npm run dev` serves a
hot-reloading harness (backed by mock storage) at http://localhost:4321.

## Checks

Run everything at once with `npm run check`, or individually:

    npm run lint       # oxlint: unused variables, unreachable/dead code, common bugs
    npm run deadcode   # knip: unused files, exports, and dependencies
    npm test           # ava: the unit tests

GitHub Actions (`.github/workflows/ci.yml`) runs all of the above on every
push and pull request. It runs `npm run webext` first, so the tests
validate the actual built bundle; run that before `npm test` locally to
exercise the bundle-validation tests too.

## License

Scaredycat is distributed under the Blue Oak Model License 1.0.0.
Read it [here](LICENSE.md).

The cat icon is 🐈 from [OpenMoji](https://openmoji.org) — the open-source
emoji and icon project. License: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
