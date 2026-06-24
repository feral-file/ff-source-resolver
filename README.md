# @feralfile/source-resolver

Keyless FF tooling package for extracting artwork token coordinates from source inputs.

## Scope

`@feralfile/source-resolver` resolves user-supplied source identifiers into
token information:

- chain: `ethereum` or `tezos`
- contract address
- token id

It intentionally keeps secrets, API keys, playlist construction, DP-1 signing,
and marketplace orchestration outside the package. Those belong in callers or
server wrappers.

## Supported Sources

The parser currently recognizes:

- Objkt
- Art Blocks
- fxhash
- Feral File
- OpenSea
- SuperRare
- Neort
- Verse
- Raster
- raw `ethereum:{contract}:{tokenId}` and `tezos:{contract}:{tokenId}` inputs
- Ethereum and Tezos wallet addresses for caller-side catalog lookup

## Resolver Order

`resolveTokenInfo` follows the required fallback order:

1. URL/input parsing.
2. Static DOM lookup using `fetch`.
3. Optional caller-provided headless browser rendering.

The browser path is an interface only. This package has no runtime browser
dependency and does not own credentials or hosted infrastructure.

## Development

```bash
npm ci
npm run verify
```

Run known real-world URL fixtures:

```bash
npm run test:live
```

The live fixture suite uses URLs confirmed in the in-app browser, follows
redirects where marketplaces expose them over HTTP, checks for disappearing
pages, and verifies resolver behavior. It does not require marketplace API keys.

Run the headless-browser resolver fixtures:

```bash
npx playwright install chromium
npm run test:headless
```

The headless suite hooks Playwright into the `HeadlessPageRenderer` interface
and verifies pages whose token links appear only after client-side rendering.
CI runs both live suites on pull requests, scheduled runs, and manual dispatch
so supported-site URL changes are caught early.
