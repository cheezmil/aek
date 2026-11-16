import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir, platform } from 'node:os'
import { resolveSlot, slotConfig } from '@cheezmil/coraek/slots'
import { assertBuildIdentity } from '../../../scripts/aek/signing-identity.mjs'

const APP_ROOT = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8'))

/**
 * Locate an already-downloaded Electron archive for this exact version.
 *
 * electron-builder otherwise downloads it on every build, and that download
 * intermittently fails with an HTTP 504 from the mirror. The archive in the
 * local Electron cache is byte-identical to the one that would be downloaded
 * (it was checksum-verified when it was fetched), so reusing it keeps builds
 * fast and offline-capable.
 *
 * @returns {string|null} the path of the cached archive, or null when there is none.
 */
function findCachedElectronArchive() {
  let version
  try {
    version = JSON.parse(readFileSync(join(APP_ROOT, 'node_modules', 'electron', 'package.json'), 'utf8')).version
  } catch {
    return null
  }
  if (!version) return null

  const fileName = `electron-v${version}-darwin-arm64.zip`
  const roots = [
    process.env.ELECTRON_CACHE,
    platform() === 'darwin' ? join(homedir(), 'Library', 'Caches', 'electron') : null,
    platform() === 'win32' ? join(process.env.LOCALAPPDATA ?? '', 'electron', 'Cache') : null,
    join(homedir(), '.cache', 'electron'),
  ].filter(Boolean)

  for (const root of roots) {
    let entries
    try { entries = readdirSync(root, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      const candidate = join(root, entry.name, fileName)
      if (existsSync(candidate)) return candidate
    }
    // The cache may also hold the archive directly.
    const direct = join(root, fileName)
    if (existsSync(direct)) return direct
  }
  return null
}

/**
 * Create an electron-builder configuration for one AEK Desktop slot.
 *
 * AEK ships two equal apps — `AEK` and `AEK Next` — built from this one source
 * tree. The slot decides everything that makes them two separate apps:
 *
 *   - `appId` → becomes the macOS `CFBundleIdentifier`, so macOS treats them
 *     as different apps (Spotlight, Dock, `userData`, Chromium's singleton
 *     lock). No manual `Info.plist` patching is needed for the packaged app.
 *   - `productName` → the app name users see.
 *   - `directories.output` → each slot builds into its own `dist/<slot>/`, so
 *     building Next never clobbers AEK.
 *   - `extraMetadata` → the slot and its ports are baked into the packaged
 *     `package.json`, so the app knows which backend it belongs to even when
 *     the user launches it from Finder (no environment variables there).
 *
 * The slot is taken from the `AEK_SLOT` environment variable and defaults to
 * `aek`, so a plain `electron-builder build` still produces the classic AEK.
 *
 * @param {'aek' | 'next'} [slot] - which slot to build.
 * @returns {import('electron-builder').Configuration} the configuration.
 */
export function createElectronBuilderConfig(slot = resolveSlot()) {
  // X5: cloud builds (GitHub Actions, manual trigger) produce UNSIGNED
  // artifacts — no local keychain / no Developer ID there. The signing
  // identity is asserted at CONFIGURATION time only for local builds;
  // AEK_CI_UNSIGNED=1 opts into the unsigned CI profile (identity null).
  const ciUnsigned = process.env.AEK_CI_UNSIGNED === '1'
  // Refuse adhoc signing at CONFIGURATION time — before electron-builder
  // writes a single byte. Throws a friendly certificate-setup guide.
  const buildIdentity = ciUnsigned ? { identity: null } : assertBuildIdentity()
  const s = slotConfig(slot)
  const cachedElectron = findCachedElectronArchive()
  if (cachedElectron) {
    console.log(`[builder] using cached Electron archive: ${cachedElectron}`)
  }
  // X5: electron-builder validates foreign-platform config blocks against a
  // restricted schema (a `linux`/`win` key on a mac build must be `null`),
  // so each host OS only carries ITS platform block. CI runners match their
  // OS 1:1 (mac job on macos-latest, etc.), local mac builds stay as before.
  const hostDarwin = process.platform === 'darwin'
  const hostWin = process.platform === 'win32'
  const hostLinux = process.platform === 'linux'
  return {
    appId: s.appId,
    productName: s.productName,
    directories: {
      output: join('dist', s.slot),
    },
    // Reuse the local Electron archive instead of re-downloading it.
    ...(cachedElectron ? { electronDist: cachedElectron } : {}),
    files: [
      'lib/**/*',
      'package.json',
    ],
    asar: true,
    ...(hostDarwin ? {
      mac: {
        icon: 'resources/icon.icns',
        category: 'public.app-category.productivity',
        // R20: macOS requires a declared reason before an app can appear in
        // System Settings → Privacy & Security → Accessibility. The prompt
        // shown by `isTrustedAccessibilityClient(true)` uses this string.
        extendInfo: {
          NSAccessibilityUsageDescription: 'AEK needs Accessibility access so you can explicitly enable desktop automation and verify developer-tool shortcuts.',
        },
        hardenedRuntime: true,
        entitlements: 'entitlements.plist',
        entitlementsInherit: 'entitlements.plist',
        // Resolved at build time from the local keychain. NEVER a hardcoded
        // fingerprint (that would only work on one developer's machine), and
        // NEVER adhoc: assertBuildIdentity() fails the build with a setup
        // guide. CI cloud builds (AEK_CI_UNSIGNED=1) ship unsigned
        // artifacts: the end user re-signs locally with their own
        // self-signed dev identity.
        identity: buildIdentity.identity,
        forceCodeSigning: !ciUnsigned,
        // X5: both architectures for the cloud release (a plain `--mac`
        // build now yields two DMGs; local deep-signing still works
        // per-arch — the local `--arm64` CLI flag restricts it).
        //
        // Per-arch artifact names come from the `dmg` section below
        // (target entries only accept `{ target, arch }` — the 26.17
        // schema rejects any other key there, so the naming template
        // lives on the per-target-type section, not on the target).
        target: {
          target: 'dmg',
          arch: ['x64', 'arm64'],
        },
      },
    } : {}),
    ...(hostWin ? {
      win: {
        icon: 'resources/icon.png',
        // NSIS installers are x86-64 only — NSIS cannot target Windows on
        // ARM (electron-builder issue #5461), so arm64 ships as a portable
        // executable (an x64 NSIS runs on arm64 Windows via emulation, but
        // we ship a real arm64 binary for it).
        //
        // Per-arch artifact names live on the `nsis` / `portable` sections
        // below (target entries only accept `{ target, arch }` in the 26.17
        // schema). Both Windows files are .exe and neither default name
        // carries the arch or the install mode, so label the NSIS installer
        // `-win-x64-setup.exe` and the portable arm64 binary
        // `-win-arm64-portable.exe`.
        target: [
          { target: 'nsis', arch: ['x64'] },
          { target: 'portable', arch: ['arm64'] },
        ],
      },
    } : {}),
    ...(hostLinux ? {
      linux: {
        icon: 'resources/icon.png',
        // fpm (deb) metadata: the app package.json carries no author/homepage
        // (private dev package), so give the .deb a neutral maintainer.
        // (`homepage` is NOT a linux option in electron-builder 26.17 — it
        // would fail the config schema.)
        maintainer: 'AEK maintainers <aek@example.com>',
        // Per-arch artifact names live on the `appImage` / `deb` sections
        // below (target entries only accept `{ target, arch }` in the 26.17
        // schema; the `dmg`/`nsis`/`portable`/`appImage`/`deb` sections each
        // carry their own `artifactName`). The default templates are
        // per-target (deb uses dpkg's `name_version_arch` style, AppImage
        // drops the default-arch suffix), so one release mixed three naming
        // schemes. The `${arch}` macro resolves per package format
        // (electron-builder `getArtifactArchName`): AppImage → x86_64/arm64,
        // deb → amd64/arm64 — the native arch labels of each format, so
        // every file names its OS and its arch.
        target: [
          { target: 'AppImage', arch: ['x64', 'arm64'] },
          { target: 'deb', arch: ['x64', 'arm64'] },
        ],
      },
    } : {}),
    // No auto-update channel exists (AEK ships via the npm slot + the host
    // backend, electron-updater is not in the app), so the differential-
    //update blockmaps electron-builder writes next to the DMG and the NSIS
    // installer are dead weight — and they leak into the cloud release.
    // (AppImage/deb targets in 26.17 don't emit blockmaps at all.)
    //
    // Per-target-type artifact names. 26.17's schema (scheme.json) only
    // allows `{ target, arch }` on a target entry (additionalProperties
    // false), so per-arch naming belongs on the target-type sections:
    // `dmg`/`nsis`/`portable`/`appImage`/`deb` each accept `artifactName`.
    // A user-forced pattern is NEVER collapsed to the default arch, so
    // `${arch}` stays in the file name on every arch.
    dmg: {
      format: 'ULFO',
      writeUpdateInfo: false,
      artifactName: '${productName}-${version}-mac-${arch}.dmg',
    },
    nsis: {
      differentialPackage: false,
      // NSIS is x64-only (see the win target note above): hard label.
      artifactName: '${productName}-${version}-win-x64-setup.exe',
    },
    portable: {
      // The win target list ships portable for arm64 only: hard label.
      artifactName: '${productName}-${version}-win-arm64-portable.exe',
    },
    appImage: {
      // `${arch}` → x86_64 / arm64 (AppImage's native arch labels).
      artifactName: '${productName}-${version}-linux-${arch}.AppImage',
    },
    deb: {
      // `${arch}` → amd64 / arm64 (dpkg's native arch labels).
      artifactName: '${productName}-${version}-linux-${arch}.deb',
    },
    extraResources: [
      {
        from: '../../../licenses',
        to: 'licenses',
      },
    ],
    extraMetadata: {
      // Slot-specific package name: Electron derives `userData` from it
      // (`~/Library/Application Support/<name>`), so two slots never share one
      // Chromium profile — sharing it would make the second app die on
      // Chromium's singleton lock.
      name: `aek-desktop${s.slot === 'next' ? '-next' : ''}`,
      version: packageJson.version,
      // Read back by the desktop main process to learn which slot it is and
      // which backend port it belongs to.
      aek: {
        slot: s.slot,
        webPort: s.webPort,
        cdpPort: s.cdpPort,
        bundleId: s.bundleId,
      },
    },
  }
}

export default createElectronBuilderConfig()
