/**
 * demoProvider.js — deterministic sample catalog.
 *
 * Used when live discovery is disabled (JOB_DISCOVERY_LIVE_ENABLED=false) or
 * when every live provider call failed (graceful degradation). No network,
 * no credentials. `sourceUrl` is intentionally null — these are fabricated
 * sample postings, so no real "View Job" link is ever presented as genuine.
 */
import { buildNormalizedJob } from '../jobNormalization.js'

export const providerName = 'demo'

const RAW_SAMPLE_JOBS = [
  {
    id: 'demo-1', title: 'Senior Frontend Engineer', company: 'Northwind Digital', location: 'London, UK',
    description: 'Build and scale our React and TypeScript design system. Requirements: React, TypeScript, CSS, testing, CI/CD.',
    workType: 'hybrid', postedAt: daysAgo(1), salaryMin: 65000, salaryMax: 85000, salaryCurrency: 'GBP',
  },
  {
    id: 'demo-2', title: 'React Engineer (Remote)', company: 'Fernbridge Labs', location: 'Worldwide',
    description: 'Remote React role building customer dashboards. Requirements: React, Redux, GraphQL, Jest.',
    workType: 'remote', postedAt: daysAgo(3), salaryMin: 70000, salaryMax: 95000, salaryCurrency: 'USD',
  },
  {
    id: 'demo-3', title: 'Full Stack Engineer', company: 'Kestrel Systems', location: 'Manchester, UK',
    description: 'Own features end to end across a Node.js and React stack. Requirements: React, Node.js, PostgreSQL, REST APIs, Docker.',
    workType: 'onsite', postedAt: daysAgo(5), salaryMin: 55000, salaryMax: 75000, salaryCurrency: 'GBP',
  },
  {
    id: 'demo-4', title: 'Frontend Developer', company: 'Solace Studio', location: 'London, UK',
    description: 'Craft accessible, performant UI. Requirements: JavaScript, CSS, HTML, Figma collaboration, accessibility.',
    workType: 'hybrid', postedAt: daysAgo(2), salaryMin: 45000, salaryMax: 60000, salaryCurrency: 'GBP',
  },
  {
    id: 'demo-5', title: 'Backend Engineer (Node.js)', company: 'Ironvale', location: 'Remote (EU)',
    description: 'Design and scale our Node.js and Express APIs. Requirements: Node.js, Express.js, PostgreSQL, Redis, AWS.',
    workType: 'remote', postedAt: daysAgo(7), salaryMin: 60000, salaryMax: 80000, salaryCurrency: 'EUR',
  },
  {
    id: 'demo-6', title: 'Senior Full Stack Engineer', company: 'Amberlight', location: 'London, UK',
    description: 'Lead full-stack delivery across React, TypeScript, and Node.js services. Requirements: React, TypeScript, Node.js, Kubernetes, CI/CD, mentoring.',
    workType: 'hybrid', postedAt: daysAgo(1), salaryMin: 80000, salaryMax: 105000, salaryCurrency: 'GBP',
  },
  {
    id: 'demo-7', title: 'DevOps Engineer', company: 'Cinderpeak', location: 'Remote',
    description: 'Own our CI/CD and cloud infrastructure. Requirements: Docker, Kubernetes, Terraform, AWS, GitHub Actions.',
    workType: 'remote', postedAt: daysAgo(10), salaryMin: 65000, salaryMax: 90000, salaryCurrency: 'USD',
  },
  {
    id: 'demo-8', title: 'Junior Frontend Engineer', company: 'Brightloop', location: 'Bristol, UK',
    description: 'Grow your React skills on a supportive team. Requirements: JavaScript, React basics, HTML, CSS.',
    workType: 'onsite', postedAt: daysAgo(4), salaryMin: 30000, salaryMax: 38000, salaryCurrency: 'GBP',
  },
]

function daysAgo(days) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString()
}

const normalizeRaw = (raw) =>
  buildNormalizedJob({
    source: providerName,
    sourceJobId: raw.id,
    sourceUrl: null,
    title: raw.title,
    company: raw.company,
    location: raw.location,
    description: raw.description,
    workType: raw.workType,
    postedAt: raw.postedAt,
    salaryMin: raw.salaryMin,
    salaryMax: raw.salaryMax,
    salaryCurrency: raw.salaryCurrency,
  })

// Synchronous/no-network — always "succeeds". The catalog is small enough
// that per-query filtering adds no value; every demo run returns the same
// small, honestly-labeled sample set (discovery scoring still ranks it).
export const search = () => ({ jobs: RAW_SAMPLE_JOBS.map(normalizeRaw) })
