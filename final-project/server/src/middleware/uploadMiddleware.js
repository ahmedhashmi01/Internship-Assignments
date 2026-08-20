import multer from 'multer'
import path from 'path'
import fs from 'fs'

const uploadDir = path.join(process.cwd(), 'uploads')

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')
    cb(null, `${Date.now()}-${safeName}`)
  },
})

// Extension is the reliable signal (browsers send inconsistent MIME types for
// .docx). We whitelist .pdf/.docx by extension and explicitly block the
// macro-enabled .docm format.
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx'])
const MACRO_MIME = 'application/vnd.ms-word.document.macroEnabled.12'

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase()

  if (ext === '.docm' || file.mimetype === MACRO_MIME) {
    return cb(new Error('Macro-enabled Word documents (.docm) are not supported. Please upload a .docx or PDF.'))
  }

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(new Error('Only PDF and DOCX files are supported.'))
  }

  cb(null, true)
}

export const uploadResume = (maxUploadFileSizeBytes) => multer({
  storage,
  limits: {
    fileSize: maxUploadFileSizeBytes,
  },
  fileFilter,
})
