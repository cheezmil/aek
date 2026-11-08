import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_ROOT = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8'))

/**
 * Create electron-builder configuration for AEK Desktop v0.
 * macOS signing uses Cheezmil Dev certificate.
 */
export function createElectronBuilderConfig() {
  return {
    appId: 'com.aek.desktop',
    productName: 'AEK',
    directories: {
      output: 'dist',
    },
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
      name: 'aek-desktop',
      version: packageJson.version,
    },
  }
}

export default createElectronBuilderConfig()
