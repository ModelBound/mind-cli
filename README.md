# @modelbound/mind-cli

Command-line tools for the [`.mind/` specification](https://github.com/ModelBound/mind-spec).

```bash
npx @modelbound/mind-cli init              # scaffold .mind/ + task-budgets.json
npx @modelbound/mind-cli new skill <name>  # create scoped skill in .mind/skills/
npx @modelbound/mind-cli skill-trust <path># score skill with scanner h5
npx @modelbound/mind-cli review approve <path>
npx @modelbound/mind-cli review gate <path> # CI gate (exit 1 if unapproved)
npx @modelbound/mind-cli status            # trust + confidence trend
```

## Install

```bash
npm i -g @modelbound/mind-cli
```

## Anti-slop defaults

`mind init` and `mind new skill` inject a **Scope Constraints** block by default (max 5 files, 250 LOC, 1 feature). Override limits repo-wide in `.modelbound/task-budgets.json`. Pass `--no-scope` to opt out.

Trust scanner **h5** flags missing scope limits, unbounded wording, unapproved dependency installs, and unbounded refactors. Run `mind skill-trust` or `mind status` to see scores and trend arrows.

## Skill review lifecycle

Review state lives in skill frontmatter (`review.state`, `review.approved_hash`, etc.). Editing an approved skill resets effective state to **draft**.

| Command | Purpose |
|---------|---------|
| `mind review request <path>` | Mark pending review |
| `mind review approve <path>` | Approve (stores body hash + trust) |
| `mind review reject <path>` | Reject with notes |
| `mind review status <path> --diff` | Show payload + trust delta vs approval |
| `mind review gate <path>` | CI gate — non-zero exit if not approved |

## Migration (0.1 → 0.2)

1. Add `.modelbound/task-budgets.json` (or run `mind init` in a fresh repo to copy defaults).
2. Add the scope-constraint block to each `.mind/skills/*.md` file (see mind-spec §10).
3. Add `review:` frontmatter or run `mind review approve` after human review.
4. Replace `mind review` (diff proposals) with `mind proposals` — the old command was renamed.

## Other commands

- `mind validate` — parse frontmatter, exit non-zero on errors
- `mind gc` — remove stale diff files (>30 days)
- `mind trust <path>` — freeze a **memory** file as human-reviewed (not skill trust)
- `mind diff <target>` — scaffold a proposed-write under `.mind/diff/`
- `mind proposals` — list pending diff proposals

## License

Apache 2.0.
