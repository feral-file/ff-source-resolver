# ff-source-resolver Local Review Delta

This file adds repository-specific context to the generated Canon local review contract in `prompts/code-review.md`.

## Resolver invariants

- Preserve resolver order: URL parsing, static DOM lookup, then the optional headless renderer.
- Keep resolver semantics and supported marketplace adapters stable unless the settled requirement changes them. Keep each marketplace and page shape isolated in its own module.
- Keep the package keyless. Do not add secrets, credential requirements, or server-only dependencies.
- The package extracts source identity; it does not build DP-1 playlists. Callers own browser implementations and credentialed marketplace APIs.

## Verification

- For behavior changes, require `npm run verify`.
- Use `npm run test:live` when known real-world URL fixtures are affected.
- Use `npm run test:headless` when headless-browser URL fixtures are affected.
