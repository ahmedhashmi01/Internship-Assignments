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

const fileFilter = (_req, file, cb) => {
  if (file.mimetype !== 'application/pdf') {
    return cb(new Error('Only PDF files are supported'))
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
