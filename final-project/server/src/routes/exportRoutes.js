import express from 'express'
import { buildEnhancedDocx } from '../services/docxService.js'
import { docxExportRequestSchema } from '../schemas/exportSchemas.js'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// Turn a candidate name into a safe filename segment (letters/digits/hyphen).
const safeFilenameBase = (name) => {
  const cleaned = String(name || '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return cleaned || null
}

// Pure transformation of client-supplied structure + accepted rewrites into a
// DOCX. No DB, no auth needed, no file paths — safe to expose to guests too.
export const createExportRouter = () => {
  const router = express.Router()

  router.post('/resume/docx', async (req, res, next) => {
    const parsed = docxExportRequestSchema.safeParse(req.body || {})
    if (!parsed.success) {
      return res.status(400).json({
        message: 'Invalid export request',
        issues: parsed.error.issues,
      })
    }

    try {
      const { structure, replacements, candidateName } = parsed.data
      const buffer = await buildEnhancedDocx({ structure, replacements })

      const base = safeFilenameBase(candidateName)
      const filename = base ? `${base}-enhanced-resume.docx` : 'enhanced-resume.docx'

      res.setHeader('Content-Type', DOCX_MIME)
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      return res.send(buffer)
    } catch (error) {
      next(error)
    }
  })

  return router
}
