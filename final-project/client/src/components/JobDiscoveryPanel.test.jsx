import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import JobDiscoveryPanel from './JobDiscoveryPanel.jsx'
import { discoverJobs, parseResume } from '../services/api.js'

vi.mock('../services/api.js', () => ({ discoverJobs: vi.fn(), parseResume: vi.fn() }))

const makeJob = (i, overrides = {}) => ({
  id: `job-${i}`,
  source: i % 2 === 0 ? 'adzuna' : 'remotive',
  sourceJobId: String(i),
  sourceUrl: `https://example.com/job/${i}`,
  title: `Job Title ${i}`,
  company: `Company ${i}`,
  location: 'London, UK',
  description: `Description for job ${i}`,
  workType: 'hybrid',
  seniority: 'senior',
  postedAt: '2026-08-18T00:00:00Z',
  salary: { min: 50000, max: 70000, currency: 'GBP' },
  discoveryScore: 90 - i,
  components: { skillOverlap: 80, roleAlignment: 80, seniorityAlignment: 80, preferenceAlignment: 80 },
  highlights: { matchedSkills: ['React', 'TypeScript'], gapSkills: ['AWS'] },
  ...overrides,
})

const resultWith = (count, overrides = {}) => ({
  mode: 'live',
  candidateProfile: { primaryRoleFamilies: ['Frontend Engineering'], adjacentRoleFamilies: [], skills: ['React'], seniority: 'senior' },
  searchQueries: ['Senior Frontend Engineer'],
  totalRetrieved: count,
  totalDisplayed: count,
  sources: ['adzuna', 'remotive'],
  results: Array.from({ length: count }, (_, i) => makeJob(i)),
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  parseResume.mockResolvedValue({ normalizedResume: { evidence: [{ id: 'ev-001', text: 'Senior Frontend Engineer with React.' }] } })
})

describe('JobDiscoveryPanel', () => {
  it('requires a resume before searching — no API call when neither text nor file is present', async () => {
    render(<JobDiscoveryPanel resumeText="" selectedFile={null} onSelectJob={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /find jobs for me/i }))
    expect(await screen.findByText(/add your resume text or upload a file/i)).toBeInTheDocument()
    expect(parseResume).not.toHaveBeenCalled()
    expect(discoverJobs).not.toHaveBeenCalled()
  })

  it('shows a loading state and disables duplicate clicks while searching', async () => {
    let resolve
    discoverJobs.mockReturnValue(new Promise((r) => { resolve = r }))
    render(<JobDiscoveryPanel resumeText="Senior Frontend Engineer with React." selectedFile={null} onSelectJob={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /find jobs for me/i }))
    const button = await screen.findByRole('button', { name: /searching for live jobs/i })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')

    fireEvent.click(button)
    await waitFor(() => expect(discoverJobs).toHaveBeenCalledTimes(1))
    resolve(resultWith(1))
  })

  it('renders EVERY returned result — no hardcoded top-3/top-4 truncation', async () => {
    discoverJobs.mockResolvedValue(resultWith(10))
    render(<JobDiscoveryPanel resumeText="Senior Frontend Engineer with React." selectedFile={null} onSelectJob={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /find jobs for me/i }))

    await screen.findByText('10 jobs found')
    expect(screen.getAllByRole('article')).toHaveLength(10)
    // The last of the 10 is present, not just the first few.
    expect(screen.getByText('Job Title 9')).toBeInTheDocument()
  })

  it('renders 4 results when 4 are returned, and 17 when 17 are returned (count always matches)', async () => {
    discoverJobs.mockResolvedValue(resultWith(4))
    const { unmount } = render(<JobDiscoveryPanel resumeText="x" selectedFile={null} onSelectJob={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /find jobs for me/i }))
    await screen.findByText('4 jobs found')
    expect(screen.getAllByRole('article')).toHaveLength(4)
    unmount()

    discoverJobs.mockResolvedValue(resultWith(17))
    render(<JobDiscoveryPanel resumeText="x" selectedFile={null} onSelectJob={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /find jobs for me/i }))
    await screen.findByText('17 jobs found')
    expect(screen.getAllByRole('article')).toHaveLength(17)
  })

  it('shows the Discovery Match score breakdown (why it fits / potential gaps)', async () => {
    discoverJobs.mockResolvedValue(resultWith(1))
    render(<JobDiscoveryPanel resumeText="x" selectedFile={null} onSelectJob={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /find jobs for me/i }))

    await screen.findByText('Job Title 0')
    expect(screen.getByText('90%')).toBeInTheDocument()
    expect(screen.getByText('Why it fits')).toBeInTheDocument()
    expect(screen.getByText('React')).toBeInTheDocument()
    expect(screen.getByText('Potential gaps')).toBeInTheDocument()
    expect(screen.getByText('AWS')).toBeInTheDocument()
  })

  it('renders a safe "View Job" link (target=_blank, rel=noopener noreferrer) when a source URL exists', async () => {
    discoverJobs.mockResolvedValue(resultWith(1))
    render(<JobDiscoveryPanel resumeText="x" selectedFile={null} onSelectJob={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /find jobs for me/i }))

    const link = await screen.findByRole('link', { name: /view job/i })
    expect(link).toHaveAttribute('href', 'https://example.com/job/0')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('labels a sample (demo) listing instead of offering a fake "View Job" link', async () => {
    discoverJobs.mockResolvedValue(resultWith(1, { mode: 'demo', results: [makeJob(0, { sourceUrl: null })] }))
    render(<JobDiscoveryPanel resumeText="x" selectedFile={null} onSelectJob={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /find jobs for me/i }))

    await screen.findByText('Job Title 0')
    expect(screen.queryByRole('link', { name: /view job/i })).not.toBeInTheDocument()
    expect(screen.getByText('Sample listing')).toBeInTheDocument()
  })

  it('"Run Full Analysis" hands the job title/description to the existing pipeline via onSelectJob', async () => {
    discoverJobs.mockResolvedValue(resultWith(1))
    const onSelectJob = vi.fn()
    render(<JobDiscoveryPanel resumeText="x" selectedFile={null} onSelectJob={onSelectJob} />)
    fireEvent.click(screen.getByRole('button', { name: /find jobs for me/i }))

    fireEvent.click(await screen.findByRole('button', { name: /run full analysis/i }))
    expect(onSelectJob).toHaveBeenCalledWith({ title: 'Job Title 0', description: 'Description for job 0' })
  })

  it('shows a graceful zero-results state without fabricating sample jobs', async () => {
    discoverJobs.mockResolvedValue(resultWith(0))
    render(<JobDiscoveryPanel resumeText="x" selectedFile={null} onSelectJob={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /find jobs for me/i }))

    expect(await screen.findByText(/no matching jobs found/i)).toBeInTheDocument()
    expect(screen.getByText(/0 jobs found/i)).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('shows an API error message when discovery fails', async () => {
    discoverJobs.mockRejectedValue(new Error('Search failed'))
    render(<JobDiscoveryPanel resumeText="x" selectedFile={null} onSelectJob={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /find jobs for me/i }))
    expect(await screen.findByText('Search failed')).toBeInTheDocument()
  })

  it('shows the fallback/demo status distinctly from live', async () => {
    discoverJobs.mockResolvedValue(resultWith(1, { mode: 'demo-fallback' }))
    render(<JobDiscoveryPanel resumeText="x" selectedFile={null} onSelectJob={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /find jobs for me/i }))
    expect(await screen.findByText(/live search unavailable/i)).toBeInTheDocument()
  })

  it('only parses the resume and builds a profile ONCE — searching again (e.g. after changing a filter) reuses it', async () => {
    discoverJobs.mockResolvedValue(resultWith(1))
    render(<JobDiscoveryPanel resumeText="Senior Frontend Engineer with React." selectedFile={null} onSelectJob={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /find jobs for me/i }))
    await screen.findByText('1 job found')
    expect(parseResume).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /find jobs for me/i }))
    await waitFor(() => expect(discoverJobs).toHaveBeenCalledTimes(2))
    expect(parseResume).toHaveBeenCalledTimes(1) // still just once
    // The second call reuses the cached candidateProfile instead of resending evidence.
    expect(discoverJobs.mock.calls[1][0]).toHaveProperty('candidateProfile')
    expect(discoverJobs.mock.calls[1][0]).not.toHaveProperty('resume')
  })

  it('renders responsively — the preferences grid stacks on mobile and expands on larger screens', () => {
    const { container } = render(<JobDiscoveryPanel resumeText="x" selectedFile={null} onSelectJob={() => {}} />)
    const grid = container.querySelector('.grid')
    expect(grid).toBeTruthy()
    expect(grid.className).toMatch(/grid-cols-1/)
    expect(grid.className).toMatch(/sm:grid-cols-2/)
  })
})
