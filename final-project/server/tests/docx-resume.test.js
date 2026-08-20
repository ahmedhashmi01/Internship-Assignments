import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import mammoth from 'mammoth'
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/server.js'
import { extractDocxStructure } from '../src/services/docxService.js'
import { makeSampleDocxBuffer } from './helpers/makeDocx.js'

// Collect a binary response body into a Buffer (supertest has no parser for the
// DOCX MIME type by default, so accumulate the raw stream ourselves).
const binaryParser = (res, cb) => {
  const chunks = []
  res.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
  res.on('end', () => cb(null, Buffer.concat(chunks)))
}

describe('DOCX upload + extraction', () => {
  let docxBuffer

  beforeAll(async () => {
    docxBuffer = await makeSampleDocxBuffer()
  })

  it('accepts a .docx upload and returns structured evidence', async () => {
    const response = await request(createApp())
      .post('/api/resume/parse')
      .attach('resumeFile', docxBuffer, {
        filename: 'resume.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })

    expect(response.status).toBe(200)
    expect(response.body.sourceType).toBe('uploaded-docx')
    expect(response.body.fileName).toBe('resume.docx')
    expect(response.body.extractedText).toContain('React')
    expect(response.body.normalizedResume.evidence[0]).toMatchObject({ id: 'ev-001' })
  })

  it('preserves document structure and a 1:1 evidence mapping', async () => {
    const response = await request(createApp())
      .post('/api/resume/parse')
      .attach('resumeFile', docxBuffer, {
        filename: 'resume.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })

    const { structure, normalizedResume } = response.body
    expect(Array.isArray(structure)).toBe(true)
    expect(structure.length).toBe(normalizedResume.evidence.length)
    structure.forEach((block, index) => {
      expect(block.evidenceId).toBe(normalizedResume.evidence[index].id)
    })
    expect(structure.some((block) => block.type === 'heading')).toBe(true)
    expect(structure.some((block) => block.type === 'listItem')).toBe(true)
  })

  it('extractDocxStructure maps each block to a stable evidenceId', async () => {
    const tmpPath = path.join(os.tmpdir(), `docx-extract-${Date.now()}.docx`)
    await fs.writeFile(tmpPath, docxBuffer)
    try {
      const { structure, normalizedResume, extractedText } = await extractDocxStructure(tmpPath)
      expect(structure.length).toBeGreaterThan(0)
      expect(structure[0].evidenceId).toBe('ev-001')
      structure.forEach((block, index) => {
        expect(block.evidenceId).toBe(normalizedResume.evidence[index].id)
      })
      expect(extractedText).toContain('Jane Doe')
    } finally {
      await fs.unlink(tmpPath).catch(() => {})
    }
  })
})

describe('POST /api/export/resume/docx', () => {
  const structure = [
    { type: 'heading', level: 1, text: 'Jane Doe', evidenceId: 'ev-001' },
    { type: 'listItem', text: 'Built responsive React interfaces for internal tools.', evidenceId: 'ev-002' },
    { type: 'listItem', text: 'Rejected bullet stays exactly as written.', evidenceId: 'ev-003' },
    { type: 'paragraph', text: 'Unreviewed paragraph is preserved.', evidenceId: 'ev-004' },
  ]

  const reparse = async (buffer) => (await mammoth.extractRawText({ buffer })).value

  it('applies accepted rewrites by evidenceId, preserves the rest, and returns a valid DOCX', async () => {
    const response = await request(createApp())
      .post('/api/export/resume/docx')
      .send({
        structure,
        replacements: { 'ev-002': 'Engineered responsive React interfaces, cutting delivery time 30%.' },
        candidateName: 'Jane Doe',
      })
      .buffer()
      .parse(binaryParser)

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('officedocument.wordprocessingml.document')
    expect(response.headers['content-disposition']).toContain('Jane-Doe-enhanced-resume.docx')

    const text = await reparse(response.body)
    // Accepted rewrite applied, original text gone.
    expect(text).toContain('Engineered responsive React interfaces, cutting delivery time 30%.')
    expect(text).not.toContain('Built responsive React interfaces for internal tools.')
    // Rejected / unreviewed blocks preserved verbatim; heading kept.
    expect(text).toContain('Rejected bullet stays exactly as written.')
    expect(text).toContain('Unreviewed paragraph is preserved.')
    expect(text).toContain('Jane Doe')
  })

  it('falls back to a default filename when no candidate name is given', async () => {
    const response = await request(createApp())
      .post('/api/export/resume/docx')
      .send({ structure: [{ type: 'paragraph', text: 'Solo line.', evidenceId: 'ev-001' }] })
      .buffer()
      .parse(binaryParser)

    expect(response.status).toBe(200)
    expect(response.headers['content-disposition']).toContain('enhanced-resume.docx')
  })

  it('rejects a request with no structure', async () => {
    const response = await request(createApp())
      .post('/api/export/resume/docx')
      .send({ replacements: {} })

    expect(response.status).toBe(400)
    expect(response.body.message).toContain('Invalid export request')
  })
})
