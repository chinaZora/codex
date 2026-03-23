const { app, BrowserWindow, shell } = require('electron')
const path = require('path')
const { spawn } = require('child_process')

const isDev = process.env.NODE_ENV === 'development'
let serverProcess = null
let mainWindow = null

function startServer () {
  serverProcess = spawn('node', ['server/app.js'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env }
  })
  serverProcess.on('error', (err) => {
    console.error('[Electron] Server process error:', err.message)
  })
  serverProcess.on('exit', (code) => {
    console.log('[Electron] Server process exited with code', code)
  })
}

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 1100,
    minHeight: 700,
    title: '跨境电商ERP - 虾皮+1688同款匹配',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // 外部链接在系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // 轮询 /api/health，Express 就绪后再加载页面，避免固定延迟在慢机器上失效
  const loadURL = () => {
    const url = isDev
      ? 'http://localhost:5173'
      : 'http://localhost:3000/app'
    mainWindow.loadURL(url).catch(() => {
      setTimeout(loadURL, 1000)
    })
  }

  const waitForServer = () => {
    const http = require('http')
    http.get('http://localhost:3000/api/health', (res) => {
      if (res.statusCode === 200) {
        loadURL()
      } else {
        setTimeout(waitForServer, 300)
      }
    }).on('error', () => {
      setTimeout(waitForServer, 300)
    })
  }

  setTimeout(waitForServer, isDev ? 500 : 200)
}

app.whenReady().then(() => {
  // Windows 沙箱网络服务兼容
  app.commandLine.appendSwitch('no-sandbox')
  startServer()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM')
  }
  if (process.platform !== 'darwin') app.quit()
})
