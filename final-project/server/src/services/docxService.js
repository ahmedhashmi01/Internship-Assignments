import fs from 'fs/promises'
import mammoth from 'mammoth'
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'

// ---------------------------------------------------------------------------
// Extraction (mammoth → structured, ordered blocks)
//
// We convert the DOCX to mammoth's clean, predictable HTML and parse the
// block-level elements in document order. This preserves the structure we need
// (headings, bullets, paragraphs, table cells) without touching the raw
// ZIP/XML. Each non-empty block becomes one evidence line with a stable
// `ev-NNN` id (1:1 with the block), so accepted rewrites can be mapped back to
// the exact paragraph on export.
// ---------------------------------------------------------------------------

const decodeEntities = (value) =>
  value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

const stripToText = (html) => decodeEntities(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()

// Matches block-level elements mammoth emits, in order. Nested inline tags
// (<strong>, <em>, <a>) inside are flattened to text; a <td> wrapping a <p>
// is captured once as the outer <td>.
const BLOCK_RE = /<(h[1-6]|p|li|td)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi

const parseBlocks = (html) => {
  const blocks = []
  let match
  while ((match = BLOCK_RE.exec(html)) !== null) {
    const tag = match[1].toLowerCase()
    const text = stripToText(match[2])
    if (!text) continue
    if (/^h[1-6]$/.test(tag)) blocks.push({ type: 'heading', level: Number(tag[1]), text })
    else if (tag === 'li') blocks.push({ type: 'listItem', text })
    else if (tag === 'td') blocks.push({ type: 'tableCell', text })
    else blocks.push({ type: 'paragraph', text })
  }
  return blocks
}

export const extractDocxStructure = async (filePath) => {
  const buffer = await fs.readFile(filePath)
  const { value: html } = await mammoth.convertToHtml({ buffer })
  let blocks = parseBlocks(html || '')

  // Fallback: if HTML yielded nothing, use raw text split into paragraphs so
  // analysis still works (structure fidelity is reduced but never empty).
  if (blocks.length === 0) {
    const { value: raw } = await mammoth.extractRawText({ buffer })
    blocks = String(raw || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((text) => ({ type: 'paragraph', text }))
  }

  const evidence = blocks.map((block, index) => ({ id: `ev-${String(index + 1).padStart(3, '0')}`, text: block.text }))
  const structure = blocks.map((block, index) => ({ ...block, evidenceId: evidence[index].id }))
  const extractedText = blocks.map((block) => block.text).join('\n')

  return {
    extractedText,
    structure,
    normalizedResume: { originalText: extractedText, evidence },
  }
}

// ---------------------------------------------------------------------------
// Generation (docx → enhanced resume)
//
// Rebuilds a clean, professional DOCX from the retained structure, applying the
// user's accepted rewrites by evidenceId. This is the "regenerate cleanly"
// path (chosen over fragile in-place editing) — section order, heading levels,
// and bullets are preserved; it never claims pixel-perfect fidelity.
// ---------------------------------------------------------------------------

const HEADING_BY_LEVEL = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
}

const blockToParagraph = (block, text) => {
  if (block.type === 'heading') {
    return new Paragraph({ text, heading: HEADING_BY_LEVEL[block.level] || HeadingLevel.HEADING_2 })
  }
  if (block.type === 'listItem') {
    return new Paragraph({ text, bullet: { level: 0 } })
  }
  // paragraph / tableCell (rendered as a paragraph in the MVP)
  return new Paragraph({ children: [new TextRun(text)] })
}

// Applies accepted rewrites (replacements keyed by evidenceId); every other
// block keeps its original text. Returns a DOCX Buffer.
export const buildEnhancedDocx = async ({ structure = [], replacements = {} }) => {
  const children = structure.map((block) => {
    const hasReplacement =
      block.evidenceId && Object.prototype.hasOwnProperty.call(replacements, block.evidenceId)
    const text = hasReplacement ? String(replacements[block.evidenceId]) : block.text || ''
    return blockToParagraph(block, text)
  })

  const doc = new Document({
    sections: [{ properties: {}, children: children.length > 0 ? children : [new Paragraph({ text: '' })] }],
  })

  return Packer.toBuffer(doc)
}
