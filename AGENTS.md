# AGENTS.md — ff-source-resolver Repository Contract

This file is the repository-level contract for humans and coding agents working
in `ff-source-resolver`.

## Repository overview

- Project: `ff-source-resolver`
- Package: `@feralfile/source-resolver`
- Purpose: keyless FF tooling for extracting artwork token information from
  marketplace URLs, raw token coordinates, and related source inputs
- Primary runtime: Node.js + TypeScript
- Source context: extracted from `feral-file/ff1-cli`
- Domain terms to keep consistent: `FF1`, `source resolver`, `token coordinates`,
  `marketplace adapter`, `headless renderer`, `DP-1`

## Operating model

Default sequence:

`spec -> design -> tasks -> tests -> implementation -> verification -> review -> merge`

For behavior changes, TDD is the default discipline. Small, low-risk fixes can
compress the sequence, but they still need focused verification and review.

## Non-negotiables

- Keep the library keyless. Do not add secrets, API keys, or server-only
  dependencies.
- Keep resolver order intact: URL parse, static DOM lookup, optional headless
  renderer.
- Keep each site in its own module and each URL/page shape in its own
  sub-module.
- Prefer replacing flawed parsing paths over adding compatibility shims.
- Keep functions small, composable, and testable.
- Use TypeScript for new or updated source.
- Add or update JSDoc when functions change.
- Preserve business-rule comments that document marketplace invariants.

## Architecture constraints

- The library extracts source identity. It does not build DP-1 playlists.
- The library may expose interfaces for browser rendering, but callers own the
  browser implementation and infrastructure.
- Marketplace API calls that require credentials belong outside this package.
- The package may expose parse markers for caller-owned resolution paths.

## Testing expectations

For behavior changes:

1. Add or update focused unit tests first where practical.
2. Implement until tests pass.
3. Refactor with tests green.
4. Run verification before handoff.

Required verification:

```bash
npm run verify
```

Known real-world URL fixtures are checked by:

```bash
npm run test:live
```

Headless-browser URL fixtures are checked by:

```bash
npm run test:headless
```

GitHub Actions run verification, live fixture checks, and Playwright headless
fixture checks on pull requests, scheduled runs, and manual dispatch.

## Definition of done

A task is complete only when:

1. The requested change is implemented.
2. Relevant tests were added or updated, or an explicit reason is given.
3. Verification passes.
4. Docs are updated when behavior or usage changes.
5. Fresh-context review returns `Verdict: accept`.
6. The branch is merge-ready without hidden follow-up work.

## Review loop

After implementation, run a review loop before merge or release preparation.

1. Create a compact handoff with goal, scope, files changed, key decisions,
   checks run, and known limitations.
2. Run a fresh-context review using `prompts/code-review.md`.
3. If review returns `Verdict: revise`, address findings and review again.
4. Proceed only after `Verdict: accept`.

## Commit and PR conventions

- Use Conventional Commits when creating commits.
- Keep commits focused and reviewable.
- PR or handoff summaries should include goal, scope, decisions, tests, and
  remaining risks.
