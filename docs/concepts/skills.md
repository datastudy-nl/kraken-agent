---
layout: layouts/docs.njk
title: Skills & Self-Improvement
description: Auto-created skills, reflection loop, and progressive disclosure
---

# Skills & Self-Improvement

Most agents start from zero every time. You explain a workflow, they execute it, and tomorrow they've forgotten the whole thing. Kraken learns from experience. When it solves a complex problem, it writes down what it did — as a **skill** — so it can do it better next time.

## What is a skill?

A skill is a Markdown document that captures a reusable procedure. It includes when to use it, the steps to follow, and common pitfalls:

```markdown
# git-workflow

## When to Use
When the user asks to commit, push, or create a PR.

## Procedure
1. Stage changes: `git add -A`
2. Commit with conventional format: `git commit -m "type(scope): description"`
3. Push to remote: `git push origin HEAD`
4. If PR requested: use GitHub CLI `gh pr create --fill`

## Pitfalls
- Always check for unstaged changes before committing
- Don't amend published commits without asking
- Verify the branch is up to date before pushing

## Learned Exceptions
- This user prefers `feat:` over `feature:` prefix
- Always run `npm test` before committing in JS projects
```

Skills are stored in PostgreSQL with vector embeddings. When a new query arrives, Kraken searches for the top 3 most relevant skills by embedding similarity and loads them into context.

---

## Auto-Creation

Kraken doesn't wait for you to write skills manually. After every conversation, a **reflection worker** evaluates whether the conversation produced something worth remembering.

### Triggers

A skill is auto-created when any of these conditions are met:

| Trigger | Why |
|---------|-----|
| **5+ tool calls** | Complex multi-step workflows are worth codifying |
| **Error recovery** | The agent failed, then found a working approach — that recovery path is valuable |
| **Novel procedure** | A workflow the agent hasn't seen before was executed successfully |
| **User correction** | The user showed a better way — the agent should remember it |

The threshold for tool calls is configurable via `KRAKEN_SKILL_MIN_TOOL_CALLS` (default: 5).

### The reflection process

```
Conversation ends
        ↓
   Reflection worker checks triggers
        ↓
   If triggered:
   ├── Analyze conversation for reusable patterns
   ├── Extract procedure steps, pitfalls, edge cases
   ├── Check if a similar skill already exists
   │   ├── YES → Update existing skill (increment version)
   │   └── NO  → Create new skill
   ├── Generate embedding for relevance matching
   └── Store in PostgreSQL
```

### Skill versioning

Skills have a `version` field that increments on every update. When the reflection worker updates an existing skill, it merges new learnings into the existing document rather than replacing it. The "Learned Exceptions" section grows over time with user-specific variations.

---

## Progressive Disclosure

Not all skills are relevant to every query. Loading all skills into context would waste tokens and add noise.

Kraken uses **progressive disclosure**:

1. When a message arrives, compute its embedding
2. Search skills by embedding similarity
3. Load the top 3 matches into the system prompt
4. Skills below the relevance threshold are ignored

This means:

- A question about Git loads the `git-workflow` skill
- A question about databases loads `database-migration` and `schema-design`
- A casual greeting loads nothing — no wasted tokens

The number of skills loaded per query is configurable via `KRAKEN_MAX_SKILLS_PER_QUERY` (default: 3).

---

## Self-Improvement Loop

Skills don't just get created — they **improve during use**. Here's the full cycle:

```
1. User asks something complex
        ↓
2. Kraken loads relevant skills (if any exist)
        ↓
3. Kraken executes the task (using skills as guidance)
        ↓
4. Reflection worker evaluates the result:
   ├── Was the skill helpful? Keep it.
   ├── Did the user correct something? Update the skill.
   ├── Was the approach novel? Create a new skill.
   └── Did the skill lead to an error? Add a pitfall.
        ↓
5. Updated skill is available for next query
```

Over time, Kraken builds a library of procedures tailored to **your** workflows. Not generic best practices — your specific patterns, exceptions, and preferences.

---

## Managing Skills

### Create a skill manually

```python
client.skills.create(
    "deploy-production",
    content="""
    # deploy-production

    ## When to Use
    When deploying to production environment.

    ## Procedure
    1. Run test suite: `npm test`
    2. Build: `npm run build`
    3. Tag release: `git tag v$(date +%Y.%m.%d)`
    4. Push tag: `git push origin --tags`
    5. Deploy: `docker-compose -f docker-compose.prod.yml up -d`
    """,
    tags=["deployment", "production", "docker"],
)
```

### List skills

```python
# All skills
for skill in client.skills.list():
    print(f"{skill.name} v{skill.version} — {skill.tags}")

# Filter by tag
for skill in client.skills.list(tag="git"):
    print(skill.name)
```

### Update a skill

```python
client.skills.update(
    skill_id,
    content="...",  # Updated procedure
    tags=["git", "workflow", "ci"],
)
```

---

## Disabling Auto-Creation

If you prefer to manage skills manually:

```bash
KRAKEN_SKILL_AUTO_CREATE=false
```

Skills will still be loaded from the database and used during conversations — they just won't be created automatically.
