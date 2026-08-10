# Skill: AI Provider Benchmark

## Purpose
Benchmark the Resume Analyzer's AI execution without making speculative code changes.

## Instructions

Test:
- one job
- two jobs

Capture:
- total wall-clock time
- provider
- model
- fallback index
- skillMatch duration
- bulletRewrite duration
- retries
- schema failures
- worker failures

Compare against the latest known benchmark.

Do not modify code unless a confirmed runtime defect is found.

Never print:
- API keys
- Authorization headers
- full resume content
- raw private prompts

## Output
1. Timing table
2. Provider/model used
3. Worker results
4. Confirmed defects
5. Remaining bottleneck
