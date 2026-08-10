import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ResumeForm from './ResumeForm.jsx'

describe('ResumeForm', () => {
  it('allows typing full sentences in resume and job fields without focus loss or reset', () => {
    const handleSubmit = vi.fn()
    render(<ResumeForm initialResumeText="" initialJobs={[{ title: '', description: '' }]} onSubmit={handleSubmit} onBack={() => {}} submitting={false} submitError="" />)

    const resumeInput = screen.getByPlaceholderText(/Ingest the strategic profile/i)
    fireEvent.change(resumeInput, { target: { value: 'Experienced software developer with React and Node skills.' } })
    expect(resumeInput.value).toBe('Experienced software developer with React and Node skills.')

    const titleInput = screen.getByPlaceholderText(/Chief Product Officer/i)
    fireEvent.change(titleInput, { target: { value: 'Senior Frontend Engineer' } })
    expect(titleInput.value).toBe('Senior Frontend Engineer')

    const descInput = screen.getByPlaceholderText(/Paste strategic objectives/i)
    fireEvent.change(descInput, { target: { value: 'Responsible for leading frontend development and user interface design.' } })
    expect(descInput.value).toBe('Responsible for leading frontend development and user interface design.')
  })

  it('validates pdf mode correctly when file or extracted text is present', async () => {
    const handleSubmit = vi.fn()
    render(<ResumeForm initialResumeText="Extracted PDF Text" initialJobs={[{ title: 'Dev', description: 'React' }]} onSubmit={handleSubmit} onBack={() => {}} submitting={false} submitError="" />)

    const pdfTab = screen.getByRole('button', { name: /IMPORT PDF/i })
    fireEvent.click(pdfTab)

    const submitBtn = screen.getByRole('button', { name: /Execute Analysis/i })
    fireEvent.click(submitBtn)

    expect(handleSubmit).toHaveBeenCalledWith({
      resumeText: 'Extracted PDF Text',
      jobs: [{ title: 'Dev', description: 'React' }],
      selectedFile: null,
      resumeMode: 'pdf',
    })
  })
})
