import path from 'path'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/server.js'

describe('POST /api/resume/parse', () => {
  it('accepts pasted resume text', async () => {
    const response = await request(createApp())
      .post('/api/resume/parse')
      .field('resumeText', 'Experienced frontend developer.\nBuilt React apps.')

    expect(response.status).toBe(200)
    expect(response.body.sourceType).toBe('pasted-text')
    expect(response.body.normalizedResume.evidence[0]).toMatchObject({ id: 'ev-001' })
  })

  it('accepts a valid PDF upload', async () => {
    const pdfPath = path.resolve('tests/fixtures/sample-resume.pdf')
    const response = await request(createApp())
      .post('/api/resume/parse')
      .attach('resumeFile', pdfPath)

    expect(response.status).toBe(200)
    expect(response.body.sourceType).toBe('uploaded-pdf')
    expect(response.body.fileName).toBe('sample-resume.pdf')
    expect(response.body.normalizedResume.originalText).toContain('Experienced')
  })

  it('rejects missing input', async () => {
    const response = await request(createApp()).post('/api/resume/parse')

    expect(response.status).toBe(400)
    expect(response.body.message).toContain('Provide resume text or upload a PDF file')
  })

  it('rejects wrong file types', async () => {
    const response = await request(createApp())
      .post('/api/resume/parse')
      .attach('resumeFile', Buffer.from('not a pdf'), { filename: 'notes.txt', contentType: 'text/plain' })

    expect(response.status).toBe(400)
    expect(response.body.message).toContain('Only PDF files are supported')
  })

  it('rejects oversized files', async () => {
    const largeBuffer = Buffer.alloc(6 * 1024 * 1024, 'a')
    const response = await request(createApp())
      .post('/api/resume/parse')
      .attach('resumeFile', largeBuffer, { filename: 'big.pdf', contentType: 'application/pdf' })

    expect(response.status).toBe(413)
  })

  it('returns a clear fallback for unreadable PDFs', async () => {
    const response = await request(createApp())
      .post('/api/resume/parse')
      .attach('resumeFile', Buffer.from('%PDF-1.4\n%not a real pdf'), { filename: 'unreadable.pdf', contentType: 'application/pdf' })

    expect(response.status).toBe(200)
    expect(response.body.warning).toContain('Unable to read text')
    expect(response.body.normalizedResume.originalText).toBe('')
  })
})
