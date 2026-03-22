#!/usr/bin/env node

(async () => {
  await import('../node_modules/vite/bin/vite.js')
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
