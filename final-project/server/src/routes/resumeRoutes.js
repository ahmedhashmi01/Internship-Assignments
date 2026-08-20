import express from 'express'
import path from 'path'
import { normalizeResume } from '../services/inputValidation.js'
import { cleanupTempFile, extractPdfText } from '../services/pdfService.js'
import { extractDocxStructure } from '../services/docxService.js'
import { uploadResume } from '../middleware/uploadMiddleware.js'
import { resumeParseRequestSchema } from '../schemas/resumeParseSchemas.js'

export const createResumeRouter = (config) => {
  const router = express.Router()
  const upload = uploadResume(config.maxUploadFileSizeBytes)

  router.post('/parse', (req, res, next) => {
    upload.single('resumeFile')(req, res, (error) => {
      if (error) {
        const statusCode = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400
        return res.status(statusCode).json({
          message: error.message,
          validationErrors: [{ field: 'resumeFile', message: error.message }],
        })
      }

      next()
    })
  }, async (req, res, next) => {
    try {
      const parsedBody = resumeParseRequestSchema.safeParse(req.body || {})
      if (!parsedBody.success) {
        return res.status(400).json({
          message: 'Invalid request payload',
          validationErrors: parsedBody.error.issues.map((issue) => ({
            field: issue.path[0] || 'request',
            message: issue.message,
          })),
        })
      }

      const pastedText = typeof req.body?.resumeText === 'string' ? req.body.resumeText.trim() : ''
      const uploadedFile = req.file

      if (!pastedText && !uploadedFile) {
        return res.status(400).json({
          message: 'Provide resume text or upload a PDF or DOCX file',
          validationErrors: [{ field: 'resumeText', message: 'Resume text is required' }],
        })
      }

      let sourceType = 'pasted-text'
      let fileName
      let extractedText = pastedText
      let warning
      // For DOCX only: ordered structural blocks (with evidenceId) used to
      // regenerate an enhanced DOCX later. Null for PDF/pasted-text.
      let structure = null

      if (uploadedFile) {
        fileName = uploadedFile.originalname
        const ext = path.extname(uploadedFile.originalname || '').toLowerCase()

        if (ext === '.docx') {
          sourceType = 'uploaded-docx'
          try {
            const parsed = await extractDocxStructure(uploadedFile.path)
            extractedText = parsed.extractedText
            structure = parsed.structure
          } catch {
            warning = 'Unable to read this Word document. Please paste the resume text instead.'
            extractedText = ''
          }
        } else {
          sourceType = 'uploaded-pdf'
          try {
            extractedText = await extractPdfText(uploadedFile.path)
          } catch (error) {
            warning = error.message
            extractedText = ''
          }
        }
      }

      const normalizedResume = normalizeResume(extractedText)

      const response = {
        sourceType,
        fileName,
        extractedText,
        normalizedResume,
      }

      // Prefer the DOCX-derived structure's evidence IDs so they line up 1:1
      // with the retained structural blocks for export.
      if (structure) {
        response.structure = structure
        response.normalizedResume = {
          originalText: extractedText,
          evidence: structure.map(({ evidenceId, text }) => ({ id: evidenceId, text })),
        }
      }

      if (warning) {
        response.warning = warning
      }

      return res.json(response)
    } catch (error) {
      next(error)
    } finally {
      if (req.file?.path) {
        await cleanupTempFile(req.file.path)
      }
    }
  })

  return router
}
