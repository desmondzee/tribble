---
name: using-git-worktrees
description: Use when starting feature work that needs isolation from current workspace or before executing implementation plans - creates isolated git worktrees with smart directory selection and safety verification
---

# Using Git Worktrees

## Overview

Git worktrees create isolated workspaces sharing the same repository, allowing work on multiple branches simultaneously without switching.

**Core principle:** Systematic directory selection + safety verification = reliable isolation.

## Directory Selection Process

Follow this priority order:

### 1. Check Existing Directories

```bash
ls -d .worktrees 2>/dev/null     # Preferred (hidden)
ls -d worktrees 2>/dev/null      # Alternative
```

If found: use that directory. If both exist, `.worktrees` wins.

### 2. Check AGENTS.md

```bash
grep -i "worktree.*director" AGENTS.md 2>/dev/null
```

If preference specified: use it without asking.

### 3. Ask User

If no directory exists and no AGENTS.md preference, ask which location to use.

## Safety Verification

**For project-local directories:** MUST verify directory is in `.gitignore` before creating worktree:

```bash
git check-ignore -q .worktrees 2>/dev/null
```

If NOT ignored: add to `.gitignore`, commit, then proceed.

## Creation Steps

1. Detect project name: `basename "$(git rev-parse --show-toplevel)"`
2. Create worktree: `git worktree add "$path" -b "$BRANCH_NAME"`
3. Run project setup (auto-detect from package.json, pyproject.toml, etc.)
4. Verify clean test baseline
5. Report location and test status

## Red Flags

**Never:**
- Create worktree without verifying it's ignored (project-local)
- Skip baseline test verification
- Proceed with failing tests without asking
- Assume directory location when ambiguous
