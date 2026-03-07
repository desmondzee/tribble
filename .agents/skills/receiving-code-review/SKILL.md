---
name: receiving-code-review
description: Use when receiving code review feedback, before implementing suggestions, especially if feedback seems unclear or technically questionable - requires technical rigor and verification, not performative agreement or blind implementation
---

# Code Review Reception

## Overview

Code review requires technical evaluation, not emotional performance.

**Core principle:** Verify before implementing. Ask before assuming. Technical correctness over social comfort.

## The Response Pattern

```
WHEN receiving code review feedback:

1. READ: Complete feedback without reacting
2. UNDERSTAND: Restate requirement in own words (or ask)
3. VERIFY: Check against codebase reality
4. EVALUATE: Technically sound for THIS codebase?
5. RESPOND: Technical acknowledgment or reasoned pushback
6. IMPLEMENT: One item at a time, test each
```

## Handling Unclear Feedback

If any item is unclear: STOP — do not implement anything yet. Ask for clarification on unclear items.

Items may be related. Partial understanding = wrong implementation.

## When To Push Back

Push back when:
- Suggestion breaks existing functionality
- Reviewer lacks full context
- Violates YAGNI (unused feature)
- Technically incorrect for this stack
- Conflicts with architectural decisions

**How:** Use technical reasoning, not defensiveness. Reference working tests/code.

## Implementation Order

For multi-item feedback:
1. Clarify anything unclear FIRST
2. Then implement in order: Blocking → Simple → Complex
3. Test each fix individually
4. Verify no regressions

## Acknowledging Correct Feedback

When feedback IS correct:
- "Fixed. [Brief description of what changed]"
- "Good catch — [specific issue]. Fixed in [location]."
- Just fix it and show in the code

No performative agreement. Actions speak.
