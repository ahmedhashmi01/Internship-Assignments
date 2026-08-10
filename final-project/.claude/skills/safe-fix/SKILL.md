# Skill: Safe Bug Fix

## Purpose
Fix a confirmed defect with the smallest reasonable change and protect it with regression tests.

## Instructions

1. Reproduce or verify the reported defect.
2. Identify the root cause before editing.
3. Do not refactor unrelated code.
4. Preserve:
   - API contracts
   - provider architecture
   - scoring behavior unless directly involved
   - UI layout unless directly involved
5. Implement the smallest reliable fix.
6. Add a regression test that fails before the fix and passes afterward.
7. Run affected tests first.
8. Run full backend/frontend tests and lint afterward.
9. Report any remaining limitations.

## Output
1. Root cause
2. Files changed
3. Fix
4. Tests/results
5. Remaining limitations
