---
name: systematic-debugging
description: Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes
---

# Systematic Debugging

## Overview

Random fixes waste time and create new bugs. Quick patches mask underlying issues.

**Core principle:** ALWAYS find root cause before attempting fixes. Symptom fixes are failure.

**Violating the letter of this process is violating the spirit of debugging.**

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you haven't completed Phase 1, you cannot propose fixes.

## The Four Phases

Complete each phase before proceeding to the next.

### Phase 1: Root Cause Investigation

**BEFORE attempting ANY fix:**

1. **Read Error Messages Carefully** — Don't skip past errors. Read stack traces completely. Note line numbers, file paths, error codes.

2. **Reproduce Consistently** — Can you trigger it reliably? What are the exact steps? If not reproducible → gather more data, don't guess.

3. **Check Recent Changes** — Git diff, recent commits, new dependencies, config changes, environmental differences.

4. **Gather Evidence in Multi-Component Systems** — For each component boundary: log what enters, log what exits, verify environment propagation. Run once to gather evidence showing WHERE it breaks.

5. **Trace Data Flow** — Where does bad value originate? What called this with bad value? Keep tracing up until you find the source. Fix at source, not at symptom.

### Phase 2: Pattern Analysis

1. **Find Working Examples** — Locate similar working code in same codebase
2. **Compare Against References** — Read reference implementations COMPLETELY
3. **Identify Differences** — List every difference, however small
4. **Understand Dependencies** — What components, settings, assumptions?

### Phase 3: Hypothesis and Testing

1. **Form Single Hypothesis** — "I think X is the root cause because Y"
2. **Test Minimally** — Smallest possible change, one variable at a time
3. **Verify Before Continuing** — Didn't work? Form NEW hypothesis. DON'T add more fixes on top.

### Phase 4: Implementation

1. **Create Failing Test Case** — Use test-driven-development skill
2. **Implement Single Fix** — ONE change, no "while I'm here" improvements
3. **Verify Fix** — Test passes? No regressions?
4. **If Fix Doesn't Work** — If < 3 attempts: return to Phase 1. **If ≥ 3: STOP and question the architecture.** Discuss before attempting more fixes.

## Red Flags — STOP and Follow Process

- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "I don't fully understand but this might work"
- Proposing solutions before tracing data flow
- "One more fix attempt" (when already tried 2+)
- Each fix reveals new problem in different place

**ALL of these mean: STOP. Return to Phase 1.**

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Issue is simple, don't need process" | Simple issues have root causes too |
| "Emergency, no time for process" | Systematic is FASTER than thrashing |
| "Just try this first, then investigate" | First fix sets the pattern. Do it right. |
| "One more fix attempt" (after 2+ failures) | 3+ failures = architectural problem |
