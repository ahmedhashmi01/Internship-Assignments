# Skill: Create Pull Request

## Purpose
Create a clean Git branch, commit the current intended changes, push the branch, and prepare a GitHub pull request without accidentally including unrelated files.

## Instructions

1. Inspect repository state first:
   - `git status`
   - `git branch --show-current`
   - `git remote -v`
   - `git diff --stat`

2. Do not automatically add unrelated untracked directories.

3. Determine whether:
   - changes are uncommitted
   - changes are already committed
   - current branch already has a remote
   - current branch contains commits not in `origin/main`

4. If the user requests a new branch:
   - create a concise kebab-case branch name based on the changes
   - do not recreate an existing branch unless necessary

5. Stage only files belonging to the intended project/change.

6. Generate a concise commit message describing the actual diff.

7. Commit only if there are staged changes.

8. Push with upstream:
   `git push -u origin <branch>`

9. Verify PR eligibility:
   `git fetch origin`
   `git log --oneline origin/main..origin/<branch>`
   `git diff --stat origin/main...origin/<branch>`

10. Generate:
    - PR title
    - PR description
    - summary of changes
    - tests run
    - known limitations

11. Give the GitHub comparison target:
    `base: main`
    `compare: <branch>`

12. Never:
    - force push unless explicitly requested
    - push directly to main
    - commit `.env`
    - commit API keys
    - include unrelated sibling projects
    - claim a PR exists unless it was actually created

## Output

Return:

1. Current branch
2. Files being included
3. Commit message
4. Push result
5. PR title
6. PR description
7. Any warnings
