/**
 * searchQueryBuilder.js
 *
 * Deterministically builds AT MOST 3 search queries from the candidate
 * profile — no AI call. Order: (1) seniority + primary role family,
 * (2) strongest title signal (top skill + "Engineer"), (3) one adjacent
 * role family.
 */
import { ROLE_FAMILY_TITLE } from './discoveryMatch.js'

const MAX_QUERIES = 3

const SENIORITY_LABEL = Object.freeze({ junior: 'Junior', mid: '', senior: 'Senior', lead: 'Lead' })

const titleFor = (roleFamily) => ROLE_FAMILY_TITLE[roleFamily] || roleFamily

export const buildSearchQueries = (candidateProfile = {}) => {
  const { primaryRoleFamilies = [], adjacentRoleFamilies = [], skills = [], seniority } = candidateProfile
  const queries = []
  const seen = new Set()

  const add = (value) => {
    const trimmed = String(value || '').trim().replace(/\s+/g, ' ')
    if (!trimmed) return
    const key = trimmed.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    queries.push(trimmed)
  }

  // 1. Primary role family, seniority-qualified.
  const primaryTitle = titleFor(primaryRoleFamilies[0])
  if (primaryTitle) {
    const label = SENIORITY_LABEL[seniority] || ''
    add(label ? `${label} ${primaryTitle}` : primaryTitle)
  }

  // 2. Strongest title signal — top resume skill as a role, e.g. "React Engineer".
  const topSkill = skills[0]
  if (topSkill) add(`${topSkill} Engineer`)

  // 3. One adjacent role family.
  const adjacentTitle = titleFor(adjacentRoleFamilies[0])
  if (adjacentTitle) add(adjacentTitle)

  // Fallback so a completely empty profile still searches something sane.
  if (queries.length === 0) add('Software Engineer')

  return queries.slice(0, MAX_QUERIES)
}
