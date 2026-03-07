---
name: subagent-driven-development
description: Use when executing implementation plans with independent tasks in the current session
---

# Subagent-Driven Development

Execute plan by dispatching fresh agent per task, with two-stage review after each: spec compliance review first, then code quality review.

**Core principle:** Fresh agent per task + two-stage review (spec then quality) = high quality, fast iteration

## When to Use

- Have an implementation plan with mostly independent tasks
- Want to stay in the current session
- Want automatic review checkpoints

**vs. Executing Plans:** Same session, fresh agent per task, two-stage review, faster iteration (no human-in-loop between tasks).

## The Process

1. **Read plan** — extract all tasks with full text, note context
2. **For each task:**
   a. Dispatch implementer agent with full task text + context
   b. If implementer asks questions → answer, then re-dispatch
   c. Implementer implements, tests, commits, self-reviews
   d. Dispatch spec reviewer — confirms code matches spec
   e. If spec issues → implementer fixes → re-review until spec-compliant
   f. Dispatch code quality reviewer
   g. If quality issues → implementer fixes → re-review until approved
   h. Mark task complete
3. **After all tasks** — dispatch final code reviewer for entire implementation
4. **Use finishing-a-development-branch skill** to complete

## Key Rules

- Implementation agents work one at a time (no parallel — conflicts)
- Spec compliance review BEFORE code quality review (correct order matters)
- If reviewer finds issues → implementer fixes → reviewer re-reviews → loop until approved
- Provide full task text to agents (don't make them read the plan file)
- Answer agent questions before letting them proceed

## Advantages

- Fresh context per task (no confusion)
- Self-review catches issues before handoff
- Two-stage review: spec prevents over/under-building, quality ensures clean code
- Catches issues early (cheaper than debugging later)

## Red Flags

**Never:**
- Start implementation on main/master without explicit user consent
- Skip reviews (spec compliance OR code quality)
- Proceed with unfixed issues
- Dispatch multiple implementation agents in parallel
- Start code quality review before spec compliance is approved
- Move to next task while either review has open issues
