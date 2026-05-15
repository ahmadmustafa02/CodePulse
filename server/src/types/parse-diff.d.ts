/** Ambient module declarations for parse-diff (no @types package on npm). */

declare module 'parse-diff' {
  export type ParseDiffChangeType = 'normal' | 'add' | 'del';

  export type ParseDiffChange = {
    type: ParseDiffChangeType;
    content: string;
    ln?: number;
    ln1?: number;
    ln2?: number;
    normal?: boolean;
  };

  export type ParseDiffChunk = {
    content: string;
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    changes: ParseDiffChange[];
  };

  export type ParseDiffFile = {
    from?: string;
    to?: string;
    old?: string;
    new?: string;
    chunks: ParseDiffChunk[];
  };

  function parseDiff(input: string): ParseDiffFile[];

  export default parseDiff;
}
