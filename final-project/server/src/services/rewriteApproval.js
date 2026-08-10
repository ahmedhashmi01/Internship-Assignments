// Flags that indicate a rewrite likely contains fabricated content and
// therefore must not be approvable by default in the UI.
const NEEDS_REVIEW_FLAGS = new Set(['invented-metric', 'unsupported-skill-or-tool'])

export const computeNeedsReview = (flags = []) => flags.some((flag) => NEEDS_REVIEW_FLAGS.has(flag))
