# HUSH for macOS

The desktop app bundles the existing website and Chromium with Electron. It runs
without Python, Node, a browser, or a web server installed on the destination Mac.
Ollama is optional and installed separately. The web version is unchanged.

## Build and run

On macOS 12 or newer, install Node.js 24 and the Xcode Command Line Tools, then:

```sh
npm ci
npm test
npm run test:desktop
npm start
```

Create an app for the Mac you are building on:

```sh
CSC_IDENTITY_AUTO_DISCOVERY=false npm run pack:mac
```

Find `HUSH.app` inside `dist/mac-arm64/` on Apple Silicon or `dist/mac/` on Intel.
Copy it to Applications and open it. To create separate ZIP downloads for both
architectures:

```sh
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac
```

The ZIPs are `dist/HUSH-1.0.0-mac-arm64.zip` and
`dist/HUSH-1.0.0-mac-x64.zip`. Choose arm64 for Apple Silicon, x64 for Intel.
The GitHub Actions macOS workflow also builds these ZIPs as downloadable artifacts.
It does not publish a release or change the default branch.

## Local model

Quit an already-running Ollama instance before starting a terminal instance:

```sh
OLLAMA_ORIGINS='hush://app' ollama serve
```

In a second terminal, install the model if needed:

```sh
ollama pull llama3.1
```

Open HUSH settings and use `http://localhost:11434` with `llama3.1:latest`, then
Test connection. Only the origin allowance changes; HUSH still uses Ollama's
native API directly. The connection check requests model names; distillation
sends an entry when you press Distill with AI. Manual lessons work offline.
Existing custom endpoints remain supported and need to permit `hush://app`.
Choosing a remote endpoint sends the entry to that endpoint.

## Journal storage and export

Desktop data is separate from browser data. It lives in Electron's persistent
profile at `~/Library/Application Support/HUSH`, under the stable `hush://app`
origin. App upgrades and moving the `.app` do not change that origin. Existing
browser journals are not automatically imported; this project has no import UI.
The original Ember-key migration still runs within the desktop profile.

Export in Settings opens a native Save dialog for the original JSON export.
Quit HUSH before making a profile backup. Removing the app alone does not remove
the profile. Deleting the profile removes the desktop journal. As in the web
version, storage is not encrypted and expiry is processed while the app runs or
when it next opens, not by a background service while the app is closed.

## Verification

`npm run test:desktop` uses a temporary profile and synthetic text. It checks
renderer isolation, the asset allowlist, Ollama-compatible GET/POST requests to
a local mock, saving, persistence across process restarts, forgetting, JSON
export, and persistence of the forgotten state. It never invokes a real model.
To exercise a packaged app with the same test:

```sh
HUSH_EXECUTABLE="$PWD/dist/mac-arm64/HUSH.app/Contents/MacOS/HUSH" npm run test:desktop
```

Use `dist/mac/` instead for Intel. A mock proves the request/response flow, not
model quality or a particular user's Ollama installation.

## Signing and sharing

The commands above deliberately create a local build without a Developer ID
identity. Electron Builder applies an ad-hoc signature; this is not an Apple
Developer ID signature and the app is not notarized. Downloaded copies may be
blocked by Gatekeeper. Do not disable Gatekeeper globally.

For public distribution, supply your own Developer ID Application certificate
through Electron Builder's `CSC_LINK` and `CSC_KEY_PASSWORD`, configure Apple's
notarization credentials (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and
`APPLE_TEAM_ID`), and override the local ad-hoc identity when building:
`npm run dist:mac -- -c.mac.identity="Developer ID Application: YOUR NAME (TEAMID)"`.
Do not set `CSC_IDENTITY_AUTO_DISCOVERY=false` for that build. Keep credentials outside the repository.
Verify the final app with `codesign --verify --deep --strict`,
`xcrun stapler validate`, and `spctl --assess --type execute` before release.
Signing/notarization requires the maintainer's Apple credentials and is not part
of the unsigned CI job.

Packaging follows [Electron's security guidance](https://www.electronjs.org/docs/latest/tutorial/security)
and [Electron Builder's macOS configuration](https://www.electron.build/mac/).
The renderer has no Node integration or preload bridge, is sandboxed, and only
loads bundled scripts. New windows, external navigation, and permissions are
blocked. Web security remains enabled. HTTP/HTTPS connections stay available for
the existing configurable Ollama endpoint.
