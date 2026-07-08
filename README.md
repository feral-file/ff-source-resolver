# @feralfile/source-resolver

Keyless FF tooling package for extracting artwork token coordinates from source inputs.

## Scope

`@feralfile/source-resolver` resolves user-supplied source identifiers into
token information:

- chain: `ethereum` or `tezos`
- contract address
- token id

`resolveTokenInfo` returns one token coordinate for token URLs or collection
pages where a representative token can be selected. `resolveTokenInfos` returns
an array of token coordinates for collection-like inputs when a keyless static
DOM, caller-provided rendered DOM, or public API path exposes multiple tokens.
Callers can pass `{ limit: number }` to bound collection resolution; token
results include `hasMore: true` when the source exposed additional usable token
coordinates beyond the returned limit.

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

Collection-array resolution is supported where the source exposes keyless token
data:

- Objkt collection pages through the public Objkt GraphQL API after resolving
  the collection slug, id, or KT1 contract.
- Art Blocks collection pages through the public Art Blocks GraphQL API after
  deriving the collection project id from the page.
- fxhash project pages through the public GraphQL API.
- Feral File show and series pages through public Feral File APIs.
- OpenSea collection pages through embedded item JSON or rendered item cards;
  the documented full collection API requires an API key, so it stays outside
  this keyless package.
- SuperRare collection pages through the public SuperRare GraphQL API.
- Verse series pages through the public Verse GraphQL API.
- Raster artwork collection pages through Raster's public kit API or rendered
  token cards.

Neort playlist pages expose off-chain art IDs rather than token coordinates, so
they remain outside `resolveTokenInfos`.

## Validation Utilities

The package exports helpers for callers that need to preflight source identity
before resolving:

- `isValidChain`
- `isValidContractAddress`
- `isValidTokenId`
- `isValidTokenCoords`
- `isValidWalletAddress`
- `normalizeContractAddress`
- `normalizeTokenCoords`

Validation is chain-specific. Ethereum contracts use 20-byte EVM address
construction and enforce EIP-55 checksum casing when mixed-case input is
provided. Tezos contracts must be valid KT1 Base58Check addresses. Ethereum
token ids must fit `uint256`; Tezos token ids are validated as decimal nats.

## Resolver Order

`resolveTokenInfo` follows the required fallback order:

1. URL/input parsing.
2. Static DOM lookup using `fetch`.
3. Optional caller-provided headless browser rendering.
4. Narrow public marketplace API lookup where site adapters expose one.

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
