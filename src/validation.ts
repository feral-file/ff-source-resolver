import { createHash } from 'node:crypto';
import type { IndexerChain, TokenCoords } from './types';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_INDEX = new Map([...BASE58_ALPHABET].map((char, index) => [char, index]));
const ETH_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const DECIMAL_TOKEN_ID = /^\d+$/;
const UINT256_MAX = (1n << 256n) - 1n;
const KT1_PREFIX = [2, 90, 121];
const TEZOS_WALLET_PREFIXES = [
  [6, 161, 159],
  [6, 161, 161],
  [6, 161, 164],
];
const MASK_64 = (1n << 64n) - 1n;
const KECCAK_ROUNDS = [
  0x0000000000000001n,
  0x0000000000008082n,
  0x800000000000808an,
  0x8000000080008000n,
  0x000000000000808bn,
  0x0000000080000001n,
  0x8000000080008081n,
  0x8000000000008009n,
  0x000000000000008an,
  0x0000000000000088n,
  0x0000000080008009n,
  0x000000008000000an,
  0x000000008000808bn,
  0x800000000000008bn,
  0x8000000000008089n,
  0x8000000000008003n,
  0x8000000000008002n,
  0x8000000000000080n,
  0x000000000000800an,
  0x800000008000000an,
  0x8000000080008081n,
  0x8000000000008080n,
  0x0000000080000001n,
  0x8000000080008008n,
];
const KECCAK_ROTATION = [
  0, 1, 62, 28, 27,
  36, 44, 6, 55, 20,
  3, 10, 43, 25, 39,
  41, 45, 15, 21, 8,
  18, 2, 61, 56, 14,
];

/**
 * isValidChain returns true when the resolver supports the given chain.
 */
export function isValidChain(chain: unknown): chain is IndexerChain {
  return chain === 'ethereum' || chain === 'tezos';
}

/**
 * normalizeContractAddress normalizes a supported contract address after
 * cryptographic validation. EVM output is lowercase; Tezos output preserves
 * Base58Check casing.
 */
export function normalizeContractAddress(
  chain: IndexerChain,
  contract: string
): string | null {
  if (!isValidContractAddress(chain, contract)) {
    return null;
  }
  return chain === 'ethereum' ? contract.toLowerCase() : contract;
}

/**
 * isValidContractAddress validates contract address construction for the
 * selected chain. Ethereum mixed-case addresses must pass EIP-55 checksum;
 * Tezos contracts must be valid KT1 Base58Check addresses.
 */
export function isValidContractAddress(chain: unknown, contract: unknown): boolean {
  if (!isValidChain(chain) || typeof contract !== 'string') {
    return false;
  }
  if (chain === 'ethereum') {
    return isValidEthereumAddress(contract);
  }
  return isValidTezosBase58Check(contract, [KT1_PREFIX]);
}

/**
 * isValidWalletAddress validates account address construction for raw address
 * lookup inputs.
 */
export function isValidWalletAddress(chain: unknown, address: unknown): boolean {
  if (!isValidChain(chain) || typeof address !== 'string') {
    return false;
  }
  if (chain === 'ethereum') {
    return isValidEthereumAddress(address);
  }
  return isValidTezosBase58Check(address, TEZOS_WALLET_PREFIXES);
}

/**
 * isValidTokenId validates a chain-specific token id. Ethereum token ids must
 * fit uint256; Tezos token ids are Micheline nats and may be any decimal nat.
 */
export function isValidTokenId(chain: unknown, tokenId: unknown): boolean {
  if (!isValidChain(chain) || typeof tokenId !== 'string' || !DECIMAL_TOKEN_ID.test(tokenId)) {
    return false;
  }
  if (chain === 'ethereum') {
    return BigInt(tokenId) <= UINT256_MAX;
  }
  return true;
}

/**
 * isValidTokenCoords validates the full chain, contract, and token id tuple.
 */
export function isValidTokenCoords(coords: unknown): coords is TokenCoords {
  if (!coords || typeof coords !== 'object') {
    return false;
  }
  const candidate = coords as Partial<TokenCoords>;
  return (
    isValidChain(candidate.chain) &&
    isValidContractAddress(candidate.chain, candidate.contract) &&
    isValidTokenId(candidate.chain, candidate.tokenId)
  );
}

/**
 * normalizeTokenCoords returns normalized coordinates only when the full tuple
 * is valid for its chain.
 */
export function normalizeTokenCoords(coords: TokenCoords): TokenCoords | null {
  const contract = normalizeContractAddress(coords.chain, coords.contract);
  if (!contract || !isValidTokenId(coords.chain, coords.tokenId)) {
    return null;
  }
  return { chain: coords.chain, contract, tokenId: coords.tokenId };
}

/**
 * isValidEthereumAddress validates EVM address structure and EIP-55 checksum
 * when checksum casing is present. All-lower/all-upper inputs are accepted as
 * non-checksummed addresses, matching common Ethereum address handling.
 */
function isValidEthereumAddress(address: string): boolean {
  if (!ETH_ADDRESS.test(address)) {
    return false;
  }
  const hex = address.slice(2);
  if (hex === hex.toLowerCase() || hex === hex.toUpperCase()) {
    return true;
  }
  return toChecksumAddress(hex.toLowerCase()) === `0x${hex}`;
}

function toChecksumAddress(lowerHexAddress: string): string {
  const hash = keccak256Ascii(lowerHexAddress);
  let checksummed = '0x';
  for (let i = 0; i < lowerHexAddress.length; i += 1) {
    const char = lowerHexAddress[i];
    const nibble = parseInt(hash[i], 16);
    checksummed += nibble >= 8 ? char.toUpperCase() : char;
  }
  return checksummed;
}

function isValidTezosBase58Check(address: string, prefixes: readonly number[][]): boolean {
  const decoded = decodeBase58(address);
  if (!decoded || decoded.length < 4) {
    return false;
  }
  const body = decoded.slice(0, -4);
  const checksum = decoded.slice(-4);
  if (!bytesEqual(checksum, sha256(sha256(body)).slice(0, 4))) {
    return false;
  }
  return prefixes.some(
    (prefix) =>
      body.length === prefix.length + 20 &&
      prefix.every((byte, index) => body[index] === byte)
  );
}

function decodeBase58(input: string): Uint8Array | null {
  let value = 0n;
  for (const char of input) {
    const digit = BASE58_INDEX.get(char);
    if (digit === undefined) {
      return null;
    }
    value = value * 58n + BigInt(digit);
  }

  const bytes: number[] = [];
  while (value > 0n) {
    bytes.push(Number(value & 0xffn));
    value >>= 8n;
  }
  bytes.reverse();

  let leadingZeroes = 0;
  for (const char of input) {
    if (char !== '1') {
      break;
    }
    leadingZeroes += 1;
  }
  return Uint8Array.from([...new Array(leadingZeroes).fill(0), ...bytes]);
}

function sha256(bytes: Uint8Array): Uint8Array {
  return createHash('sha256').update(bytes).digest();
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function keccak256Ascii(input: string): string {
  return bytesToHex(keccak256(new TextEncoder().encode(input)));
}

function keccak256(input: Uint8Array): Uint8Array {
  const rate = 136;
  const state = new Array<bigint>(25).fill(0n);
  const padded = padKeccak(input, rate);
  for (let offset = 0; offset < padded.length; offset += rate) {
    for (let i = 0; i < rate / 8; i += 1) {
      state[i] ^= readLane(padded, offset + i * 8);
    }
    keccakF1600(state);
  }

  const output = new Uint8Array(32);
  for (let i = 0; i < output.length / 8; i += 1) {
    writeLane(output, i * 8, state[i]);
  }
  return output;
}

function padKeccak(input: Uint8Array, rate: number): Uint8Array {
  const remainder = input.length % rate;
  const paddingLength = rate - remainder;
  const padded = new Uint8Array(input.length + paddingLength);
  padded.set(input);
  padded[input.length] = 0x01;
  padded[padded.length - 1] ^= 0x80;
  return padded;
}

function readLane(bytes: Uint8Array, offset: number): bigint {
  let lane = 0n;
  for (let i = 0; i < 8; i += 1) {
    lane |= BigInt(bytes[offset + i]) << BigInt(8 * i);
  }
  return lane;
}

function writeLane(bytes: Uint8Array, offset: number, lane: bigint): void {
  for (let i = 0; i < 8; i += 1) {
    bytes[offset + i] = Number((lane >> BigInt(8 * i)) & 0xffn);
  }
}

function keccakF1600(state: bigint[]): void {
  for (const roundConstant of KECCAK_ROUNDS) {
    const columnParity = new Array<bigint>(5);
    for (let x = 0; x < 5; x += 1) {
      columnParity[x] =
        state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }
    for (let x = 0; x < 5; x += 1) {
      const d = columnParity[(x + 4) % 5] ^ rotateLeft64(columnParity[(x + 1) % 5], 1);
      for (let y = 0; y < 5; y += 1) {
        state[x + 5 * y] ^= d;
      }
    }

    const rotated = new Array<bigint>(25);
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        rotated[y + 5 * ((2 * x + 3 * y) % 5)] = rotateLeft64(
          state[x + 5 * y],
          KECCAK_ROTATION[x + 5 * y]
        );
      }
    }

    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        state[x + 5 * y] =
          rotated[x + 5 * y] ^
          ((~rotated[((x + 1) % 5) + 5 * y] & MASK_64) &
            rotated[((x + 2) % 5) + 5 * y]);
      }
    }
    state[0] ^= roundConstant;
  }
}

function rotateLeft64(value: bigint, bits: number): bigint {
  if (bits === 0) {
    return value & MASK_64;
  }
  return ((value << BigInt(bits)) | (value >> BigInt(64 - bits))) & MASK_64;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
