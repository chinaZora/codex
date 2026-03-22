#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const http = require('http')
const { spawn } = require('child_process')

const rootDir = path.resolve(__dirname, '..')
const isWindows = process.platform === 'win32'
const npmCommand = isWindows ? 'npm.cmd' : 'npm'
const appUrl = 'http://localhost:3000/app'
const healthUrl = 'http://127.0.0.1:3000/api/health'

function log (message) {
  console.log(`[launch] ${message}`)
}

function runStep (command, args, label) {
  return new Promise((resolve, reject) => {
    log(`${label}...`)
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: 'inherit',
      env: process.env
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${label} failed with exit code ${code}`))
      }
    })
  })
}

function openBrowser (url) {
  const command = isWindows ? 'cmd' : 'open'
  const args = isWindows ? ['/c', 'start', '', url] : [url]
  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: 'ignore',
    detached: true
  })
  child.unref()
}

function checkHealth () {
  return new Promise((resolve) => {
    const req = http.get(healthUrl, (res) => {
      res.resume()
      resolve(res.statusCode === 200)
    })

    req.on('error', () => resolve(false))
    req.setTimeout(1500, () => {
      req.destroy()
      resolve(false)
    })
  })
}

async function waitForServer (timeoutMs) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await checkHealth()) return true
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  return false
}

function startServer () {
  const child = spawn('node', ['server/app.js'], {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env
  })

  child.on('error', (error) => {
    console.error(`[launch] server process error: ${error.message}`)
  })

  return child
}

async function ensureInstallAndBuild () {
  if (!fs.existsSync(path.join(rootDir, 'node_modules'))) {
    await runStep(npmCommand, ['install'], 'install dependencies')
  }

  await runStep(npmCommand, ['run', 'build'], 'build frontend')
}

async function main () {
  await ensureInstallAndBuild()

  if (await checkHealth()) {
    log('server is already running, opening app')
    openBrowser(appUrl)
    return
  }

  const server = startServer()

  const stopServer = () => {
    if (!server.killed) server.kill('SIGTERM')
  }

  process.on('SIGINT', stopServer)
  process.on('SIGTERM', stopServer)
  process.on('exit', stopServer)

  const ready = await waitForServer(30000)
  if (!ready) {
    stopServer()
    throw new Error('server did not become ready within 30s')
  }

  log(`app is ready at ${appUrl}`)
  openBrowser(appUrl)
  log('press Ctrl+C to stop the local server')
}

main().catch((error) => {
  console.error(`[launch] ${error.message}`)
  process.exit(1)
})
