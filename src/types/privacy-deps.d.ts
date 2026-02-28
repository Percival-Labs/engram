// ── Ambient type declarations for privacy layer dependencies ─────
// These packages don't ship TypeScript definitions.

declare module 'circomlibjs' {
  export function buildPoseidon(): Promise<{
    (inputs: bigint[]): Uint8Array;
    F: { toString(val: Uint8Array | bigint): string; toObject(val: Uint8Array): bigint };
  }>;
  export function buildEddsa(): Promise<{
    prv2pub(privateKey: Buffer | Uint8Array): [Uint8Array, Uint8Array];
    signPoseidon(privateKey: Buffer | Uint8Array, msg: Uint8Array | bigint): {
      R8: [Uint8Array, Uint8Array];
      S: bigint;
    };
    verifyPoseidon(msg: Uint8Array | bigint, sig: any, pubKey: [Uint8Array, Uint8Array]): boolean;
  }>;
  export function buildBabyjub(): Promise<{
    F: { toString(val: Uint8Array | bigint): string; toObject(val: Uint8Array): bigint };
  }>;
}

declare module 'ffjavascript' {
  export function buildBn128(singleThread?: boolean): Promise<any>;
}
