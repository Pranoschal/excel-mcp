import type { CellAddress } from '../types.js';

export function parseA1Notation(a1: string): CellAddress {
  const match = a1.match(/^([A-Z]+)(\d+)$/);
  if (!match) {
    throw new Error(`Invalid A1 notation: ${a1}`);
  }

  const col = match[1].split('').reduce((acc, char) => {
    return acc * 26 + char.charCodeAt(0) - 'A'.charCodeAt(0) + 1;
  }, 0) - 1;

  const row = parseInt(match[2]) - 1;

  return { row, col };
}
