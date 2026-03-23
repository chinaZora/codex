const express = require('express')
const router = express.Router()
const { v4: uuidv4 } = require('uuid')
const db = require('../db/index')

// GET /api/accounts
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM accounts ORDER BY is_default DESC, created_at DESC').all()
  res.json({ code: 200, data: rows })
})

// POST /api/accounts
router.post('/', (req, res) => {
  const { name, cookie, note } = req.body
  if (!name) return res.status(400).json({ code: 400, message: '账号名称不能为空' })
  if (name.length > 50) return res.status(400).json({ code: 400, message: '账号名称最多 50 个字符' })
  if (cookie && cookie.length > 8000) return res.status(400).json({ code: 400, message: 'Cookie 最多 8000 个字符' })
  const id = uuidv4()
  db.prepare('INSERT INTO accounts (id, name, cookie, note) VALUES (?,?,?,?)').run(id, name, cookie || '', note || '')
  res.json({ code: 200, data: { id }, message: '账号创建成功' })
})

// PUT /api/accounts/:id
router.put('/:id', (req, res) => {
  const { name, cookie, note } = req.body
  if (name && name.length > 50) return res.status(400).json({ code: 400, message: '账号名称最多 50 个字符' })
  if (cookie && cookie.length > 8000) return res.status(400).json({ code: 400, message: 'Cookie 最多 8000 个字符' })
  db.prepare(
    "UPDATE accounts SET name=COALESCE(?,name), cookie=COALESCE(?,cookie), note=COALESCE(?,note), updated_at=datetime('now') WHERE id=?"
  ).run(name, cookie, note, req.params.id)
  res.json({ code: 200, message: '更新成功' })
})

// DELETE /api/accounts/:id — 仅解绑，不删除采集数据
router.delete('/:id', (req, res) => {
  // account_id 字段定义了 ON DELETE SET NULL，但 SQLite 需开启 foreign_keys，已在 db/index.js 中设置
  db.prepare('DELETE FROM accounts WHERE id=?').run(req.params.id)
  res.json({ code: 200, message: '账号已删除，关联数据保留' })
})

// POST /api/accounts/:id/set-default
router.post('/:id/set-default', (req, res) => {
  const tx = db.transaction(() => {
    db.prepare('UPDATE accounts SET is_default=0').run()
    db.prepare('UPDATE accounts SET is_default=1 WHERE id=?').run(req.params.id)
  })
  tx()
  res.json({ code: 200, message: '默认账号已设置' })
})

module.exports = router
