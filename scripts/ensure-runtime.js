#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const rootDir = path.resolve(__dirname, '..')
const isWindows = process.platform === 'win32'
const npmCommand = isWindows ? 'npm.cmd' : 'npm'

function log (message) {
  console.log(`[runtime] ${message}`)
}

function makeExecutableOnUnix (relativePath) {
  if (isWindows) return

  const filePath = path.join(rootDir, relativePath)
  if (!fs.existsSync(filePath)) return

  const stat = fs.statSync(filePath)
  const desiredMode = stat.mode | 0o755
  if (desiredMode !== stat.mode) {
    fs.chmodSync(filePath, desiredMode)
    log(`chmod +x ${relativePath}`)
  }
}

function rebuildPackages (packages) {
  const result = spawnSync(npmCommand, ['rebuild', ...packages], {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env
  })

  if (result.status !== 0) {
    throw new Error(`npm rebuild failed for: ${packages.join(', ')}`)
  }
}

function validateElectronBinary () {
  const electronDir = path.join(rootDir, 'node_modules/electron/dist')
  if (!fs.existsSync(electronDir)) return

  const hasMacBinary = fs.existsSync(path.join(electronDir, 'Electron.app/Contents/MacOS/Electron'))
  const hasWindowsBinary = fs.existsSync(path.join(electronDir, 'electron.exe'))

  if (!isWindows && hasWindowsBinary && !hasMacBinary) {
    log('detected Windows Electron binary on a non-Windows machine; run "npm install" on this OS to refresh Electron')
  }

  if (isWindows && hasMacBinary && !hasWindowsBinary) {
    log('detected macOS Electron binary on Windows; run "npm install" on this OS to refresh Electron')
  }
}

function main () {
  if (process.env.SKIP_PLATFORM_RUNTIME_FIX === '1') {
    log('skip runtime fix because SKIP_PLATFORM_RUNTIME_FIX=1')
    return
  }

  makeExecutableOnUnix('node_modules/.bin/vite')
  makeExecutableOnUnix('node_modules/.bin/electron')
  makeExecutableOnUnix('node_modules/.bin/concurrently')
  makeExecutableOnUnix('node_modules/.bin/cross-env')

  // Rebuild native/runtime-sensitive packages after installs copied from another OS.
  rebuildPackages(['better-sqlite3', 'esbuild'])
  validateElectronBinary()
}

try {
  main()
} catch (error) {
  console.error(`[runtime] ${error.message}`)
  process.exit(1)
}
