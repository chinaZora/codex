const express = require('express')
const router = express.Router()
const path = require('path')
const { exportExcel } = require('../services/ExportService')

// POST /api/export/excel
router.post('/excel', (req, res) => {
  try {
    const { ids } = req.body
    const filepath = exportExcel(ids && ids.length > 0 ? ids : null)
    const filename = path.basename(filepath)
    res.download(filepath, filename, (err) => {
      if (err) console.error('Export download error:', err.message)
    })
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message })
  }
})

module.exports = router
