---
name: writing-skills
description: Use when creating new skills, editing existing skills, or verifying skills work before deployment
---

# Writing Skills

## Overview

Writing skills IS Test-Driven Development applied to process documentation.

Skills live in `.agents/skills/<skill-name>/SKILL.md`.

**Core principle:** If you didn't watch an agent fail without the skill, you don't know if the skill teaches the right thing.

## What is a Skill?

A **skill** is a reference guide for proven techniques, patterns, or tools.

**Skills are:** Reusable techniques, patterns, tools, reference guides
**Skills are NOT:** Narratives about how you solved a problem once

## SKILL.md Structure

**Frontmatter (YAML):**
- Only two fields: `name` and `description`
- Max 1024 characters total
- `name`: Letters, numbers, hyphens only
- `description`: Start with "Use when..." — triggering conditions only, NOT what the skill does

```markdown
---
name: skill-name
description: Use when [specific triggering conditions and symptoms]
---

# Skill Name

## Overview
Core principle in 1-2 sentences.

## When to Use
Symptoms and use cases. When NOT to use.

## Core Pattern
Before/after code comparison.

## Quick Reference
Table or bullets for scanning.

## Common Mistakes
What goes wrong + fixes.
```

## Key Rules

- Description = when to trigger, NOT workflow summary (agents shortcut descriptions)
- One excellent example beats many mediocre ones
- Flat namespace — all skills in `.agents/skills/`
- Keep inline unless heavy reference (100+ lines)
- Test skills with pressure scenarios before deploying

## Skill Creation Checklist

1. Create pressure scenarios (3+ for discipline skills)
2. Run scenarios WITHOUT skill — document baseline behavior
3. Write minimal skill addressing those specific failures
4. Run scenarios WITH skill — verify compliance
5. Close loopholes — add explicit counters for rationalizations
6. Commit and deploy
