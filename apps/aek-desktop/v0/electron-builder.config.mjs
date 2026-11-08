import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir, platform } from 'node:os'
import { resolveSlot, slotConfig } from '@cheezmil/coraek/slots'

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
  const s = slotConfig(slot)
  const cachedElectron = findCachedElectronArchive()
  if (cachedElectron) {
    console.log(`[builder] using cached Electron archive: ${cachedElectron}`)
  }
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
    mac: {
      icon: 'resources/icon.icns',
      category: 'public.app-category.productivity',
      hardenedRuntime: true,
      entitlements: 'entitlements.plist',
      entitlementsInherit: 'entitlements.plist',
      identity: 'E2D1D599D3BEF29FCEE0B4539EE45BF0A4F4FE81',
      forceCodeSigning: true,
      target: {
        target: 'dmg',
        arch: ['arm64'],
      },
    },
    dmg: {
      format: 'ULFO',
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
