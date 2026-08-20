import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'

// Builds a small, realistic resume .docx (headings + bullets + paragraph) as a
// Buffer, so tests need no committed binary fixture.
export const makeSampleDocxBuffer = () => {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: 'Jane Doe', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'Experience', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: 'Built responsive React interfaces for internal tools.', bullet: { level: 0 } }),
          new Paragraph({ text: 'Improved load time across analytics dashboards.', bullet: { level: 0 } }),
          new Paragraph({ children: [new TextRun('Skills: React, Node, TypeScript.')] }),
        ],
      },
    ],
  })
  return Packer.toBuffer(doc)
}
