# @feralfile/source-resolver

Keyless FF tooling package for extracting artwork token coordinates from source inputs.

This library was extracted from `feral-file/ff1-cli` so the CLI, app/server
flows, and future automation can share one source grammar for marketplace URLs
and raw token coordinates.

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

The browser path is an interface only. This package does not bundle Playwright,
Cloudflare Browser Rendering, credentials, or any hosted infrastructure.

## Development

```bash
npm ci
npm run verify
```

Run known real-world URL fixtures:

```bash
npm run test:live
```

The live fixture suite uses stable, known marketplace URLs and checks resolver
behavior. It does not require marketplace API keys.
