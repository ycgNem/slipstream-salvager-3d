// jsfxr ships no types. Only the parts the game uses are declared here.
declare module 'jsfxr' {
  /** A sound definition: a base58 string from https://sfxr.me, or the serialized JSON object. */
  export type SynthDef = string | Record<string, unknown>;
  export const sfxr: {
    /** Build an AudioBufferSourceNode (with its buffer set) in the given context. */
    toWebAudio(def: SynthDef, ctx: AudioContext): AudioBufferSourceNode;
    /** 8-bit unsigned samples at 44.1 kHz. */
    toBuffer(def: SynthDef): number[];
    generate(preset: string, options?: Record<string, unknown>): Record<string, unknown>;
    b58encode(def: Record<string, unknown>): string;
    b58decode(b58: string): Record<string, unknown>;
  };
}
