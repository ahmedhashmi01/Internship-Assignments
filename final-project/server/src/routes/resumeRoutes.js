import express from 'express'
import { normalizeResume } from '../services/inputValidation.js'
import { cleanupTempFile, extractPdfText } from '../services/pdfService.js'
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
          message: 'Provide resume text or upload a PDF file',
          validationErrors: [{ field: 'resumeText', message: 'Resume text is required' }],
        })
      }

      let sourceType = 'pasted-text'
      let fileName
      let extractedText = pastedText
      let warning

      if (uploadedFile) {
        sourceType = 'uploaded-pdf'
        fileName = uploadedFile.originalname

        try {
          extractedText = await extractPdfText(uploadedFile.path)
        } catch (error) {
          warning = error.message
          extractedText = ''
        }
      }

      const normalizedResume = normalizeResume(extractedText)

      const response = {
        sourceType,
        fileName,
        extractedText,
        normalizedResume,
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
