import { difficultyOrder } from './levels';

export { difficultyOrder };
export const difficultyBands = ['Warm-up', 'Easy', 'Medium', 'Hard', 'Expert'] as const;

const ranks = new Map<number, number>(difficultyOrder.map((level, rank) => [level, rank]));
const bandStarts = [0, 3, 21, 39, 51];

export function deliveryNumber(index: number): number {
  return (ranks.get(index) ?? 0) + 1;
}

/** The next stop after a level, wrapping to the first stop at the end. */
export function nextDelivery(index: number): number {
  const ordinal = deliveryNumber(index) - 1;
  return difficultyOrder[(ordinal + 1) % difficultyOrder.length];
}

export function difficultyOf(index: number): typeof difficultyBands[number] {
  const rank = deliveryNumber(index) - 1;
  return difficultyBands[bandStarts.filter(start => rank >= start).length - 1];
}

export function firstUnsolved(completed: readonly boolean[]): number | undefined {
  return difficultyOrder.find(level => !completed[level]);
}

export function canPlayLevel(index: number, completed: readonly boolean[]): boolean {
  const rank = ranks.get(index);
  if (rank === undefined) return false;
  const next = firstUnsolved(completed);
  return next === undefined || rank <= deliveryNumber(next) - 1;
}
