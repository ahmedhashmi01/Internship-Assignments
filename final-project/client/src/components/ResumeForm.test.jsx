import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ResumeForm from './ResumeForm.jsx'
import { extractJob } from '../services/api.js'

// ResumeForm imports only extractJob from the api module; mock it so URL-import
// tests never hit the network.
vi.mock('../services/api.js', () => ({ extractJob: vi.fn(), discoverJobs: vi.fn(), parseResume: vi.fn() }))

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

    const pdfTab = screen.getByRole('button', { name: /IMPORT FILE/i })
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

  it('advertises PDF and DOCX support and accepts a .docx upload', () => {
    render(<ResumeForm initialResumeText="" initialJobs={[{ title: '', description: '' }]} onSubmit={() => {}} onBack={() => {}} submitting={false} submitError="" />)

    fireEvent.click(screen.getByRole('button', { name: /IMPORT FILE/i }))

    expect(screen.getByText(/Supported formats: PDF, DOCX/i)).toBeInTheDocument()

    const fileInput = document.querySelector('input[type="file"]')
    expect(fileInput.getAttribute('accept')).toContain('.docx')

    const docxFile = new File(['docx bytes'], 'resume.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    fireEvent.change(fileInput, { target: { files: [docxFile] } })

    expect(screen.getByText(/Selected: resume\.docx/i)).toBeInTheDocument()
  })

  it('rejects an unsupported file type (e.g. .docm) with a clear message', () => {
    render(<ResumeForm initialResumeText="" initialJobs={[{ title: '', description: '' }]} onSubmit={() => {}} onBack={() => {}} submitting={false} submitError="" />)

    fireEvent.click(screen.getByRole('button', { name: /IMPORT FILE/i }))

    const fileInput = document.querySelector('input[type="file"]')
    const docmFile = new File(['macro doc'], 'resume.docm', {
      type: 'application/vnd.ms-word.document.macroEnabled.12',
    })
    fireEvent.change(fileInput, { target: { files: [docmFile] } })

    expect(screen.getByText(/Unsupported file type\. Supported formats: PDF, DOCX/i)).toBeInTheDocument()
    expect(screen.queryByText(/Selected: resume\.docm/i)).not.toBeInTheDocument()
  })

  describe('Job URL Import', () => {
    beforeEach(() => {
      extractJob.mockReset()
    })

    const openUrlMode = () => {
      render(<ResumeForm initialResumeText="" initialJobs={[{ title: '', description: '' }]} onSubmit={() => {}} onBack={() => {}} submitting={false} submitError="" />)
      fireEvent.click(screen.getByRole('tab', { name: /URL Import/i }))
    }

    it('exposes a URL import mode with a Job Posting URL field and Extract button', () => {
      openUrlMode()
      expect(screen.getByLabelText(/Job Posting URL/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Extract Job/i })).toBeInTheDocument()
      expect(extractJob).not.toHaveBeenCalled()
    })

    it('shows a loading state and disables duplicate clicks while extracting', async () => {
      let resolve
      extractJob.mockReturnValue(new Promise((r) => { resolve = r }))
      openUrlMode()

      fireEvent.change(screen.getByLabelText(/Job Posting URL/i), { target: { value: 'https://co.com/job' } })
      fireEvent.click(screen.getByRole('button', { name: /Extract Job/i }))

      const extracting = screen.getByRole('button', { name: /Extracting/i })
      expect(extracting).toBeDisabled()
      expect(screen.getByText(/Extracting job details/i)).toBeInTheDocument()

      fireEvent.click(extracting)
      expect(extractJob).toHaveBeenCalledTimes(1)
      resolve({ title: 'X', company: 'Y', location: 'Z', description: 'A job description long enough.', sourceUrl: 'https://co.com/job', extractionMethod: 'jsonld' })
    })

    it('populates editable fields on success and keeps them editable', async () => {
      extractJob.mockResolvedValue({
        title: 'Senior Frontend Engineer',
        company: 'Acme Corp',
        location: 'Berlin',
        description: 'Build React apps. 5+ years required.',
        sourceUrl: 'https://co.com/job',
        extractionMethod: 'jsonld',
      })
      openUrlMode()

      fireEvent.change(screen.getByLabelText(/Job Posting URL/i), { target: { value: 'https://co.com/job' } })
      fireEvent.click(screen.getByRole('button', { name: /Extract Job/i }))

      await waitFor(() => expect(screen.getByLabelText('Job Title')).toHaveValue('Senior Frontend Engineer'))
      expect(screen.getByLabelText('Company')).toHaveValue('Acme Corp')
      expect(screen.getByLabelText('Job Description')).toHaveValue('Build React apps. 5+ years required.')

      // Editable: change the title.
      fireEvent.change(screen.getByLabelText('Job Title'), { target: { value: 'Staff Engineer' } })
      expect(screen.getByLabelText('Job Title')).toHaveValue('Staff Engineer')
    })

    it('offers a manual-entry fallback when extraction fails', async () => {
      extractJob.mockRejectedValue(new Error('blocked'))
      openUrlMode()

      fireEvent.change(screen.getByLabelText(/Job Posting URL/i), { target: { value: 'https://co.com/job' } })
      fireEvent.click(screen.getByRole('button', { name: /Extract Job/i }))

      await waitFor(() =>
        expect(screen.getByText(/Could not extract this job posting automatically/i)).toBeInTheDocument(),
      )
      const fallback = screen.getByRole('button', { name: /Use Manual Entry/i })
      fireEvent.click(fallback)
      // Back to manual mode: the manual job title field is shown again.
      expect(screen.getByPlaceholderText(/Chief Product Officer/i)).toBeInTheDocument()
    })
  })

  describe('Discover Jobs tab', () => {
    it('switches to the Job Discovery panel ("Find jobs that fit my profile")', () => {
      render(<ResumeForm initialResumeText="" initialJobs={[{ title: '', description: '' }]} onSubmit={() => {}} onBack={() => {}} submitting={false} submitError="" />)
      fireEvent.click(screen.getByRole('tab', { name: /Discover Jobs/i }))

      expect(screen.getByRole('button', { name: /find jobs for me/i })).toBeInTheDocument()
      expect(screen.getByLabelText('Location')).toBeInTheDocument()
      // Manual job fields are not shown while the Discover tab is active.
      expect(screen.queryByPlaceholderText(/Chief Product Officer/i)).not.toBeInTheDocument()
    })
  })

  // Structural coverage for the compact-header layout: confirms the layout
  // pass preserved every existing element/affordance (nothing removed, no
  // duplicates introduced) without asserting on pixel sizes/positions.
  describe('Workflow page layout structure', () => {
    it('renders the phase/progress header, Load Sample Data, and both source/target cards exactly once', () => {
      render(<ResumeForm initialResumeText="" initialJobs={[{ title: '', description: '' }]} onSubmit={() => {}} onBack={() => {}} submitting={false} submitError="" />)

      expect(screen.getByRole('heading', { name: /workflow/i, level: 1 })).toBeInTheDocument()
      expect(screen.getByText('PHASE 01')).toBeInTheDocument()
      expect(screen.getByText(/Configuration & Ingestion/i)).toBeInTheDocument()
      expect(screen.getByText('33% COMPLETE')).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /load sample data/i })).toHaveLength(1)
      expect(screen.getByRole('heading', { name: /source talent data/i })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /opportunity targets/i })).toBeInTheDocument()
    })

    it('keeps the resume textarea accessible and functional (not clipped/hidden by the layout change)', () => {
      render(<ResumeForm initialResumeText="" initialJobs={[{ title: '', description: '' }]} onSubmit={() => {}} onBack={() => {}} submitting={false} submitError="" />)

      const textarea = screen.getByPlaceholderText(/Ingest the strategic profile/i)
      expect(textarea).toBeVisible()
      fireEvent.change(textarea, { target: { value: 'Some resume content.' } })
      expect(textarea.value).toBe('Some resume content.')
      expect(screen.getByText('20 CHARACTERS')).toBeInTheDocument()
    })

    it('Load Sample Data still populates the resume and job fields from the compact header', () => {
      render(<ResumeForm initialResumeText="" initialJobs={[{ title: '', description: '' }]} onSubmit={() => {}} onBack={() => {}} submitting={false} submitError="" />)

      fireEvent.click(screen.getByRole('button', { name: /load sample data/i }))
      expect(screen.getByPlaceholderText(/Ingest the strategic profile/i).value).toContain('Senior Frontend Engineer')
      expect(screen.getAllByPlaceholderText(/Chief Product Officer/i)[0].value).toBe('Senior Frontend Engineer')
    })
  })
})
