import fs from 'fs/promises'
import path from 'path'
import { PDFParse } from 'pdf-parse'

const isLikelyImageOnlyPdf = (text) => {
  return !text || text.trim().length < 40
}

export const extractPdfText = async (filePath) => {
  try {
    const pdfParse = new PDFParse({
      data: await fs.readFile(filePath),
      verbosity: 0,
    })
    const data = await pdfParse.getText()
    const text = (data.text || '').trim()

    if (isLikelyImageOnlyPdf(text)) {
      throw new Error('Unable to read text from this PDF. Please paste the resume text instead or provide a text-based PDF.')
    }

    return text
  } catch {
    throw new Error('Unable to read text from this PDF. Please paste the resume text instead or provide a text-based PDF.')
  }
}

export const cleanupTempFile = async (filePath) => {
  if (!filePath) {
    return
  }

  try {
    await fs.unlink(filePath)
  } catch {
    // Ignore cleanup failures
  }
}

export const getSafeUploadPath = (file) => {
  return path.join(process.cwd(), 'uploads', `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`)
}
