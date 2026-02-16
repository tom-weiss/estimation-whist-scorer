import {
  calculateRoundScore,
  calculateRoundScores,
  calculateTotals,
  clampRoundCount,
  generateHandSequence,
  generateSuitCycle,
  getRoundHandSizes,
  getForbiddenLastBidValue,
  isBidAllowed,
  validateDeckConstraint,
} from './rules';

describe('deck validation', () => {
  it('returns true when players x handSize is within 52 cards', () => {
    expect(validateDeckConstraint(4, 13)).toBe(true);
  });

  it('returns false when players x handSize exceeds 52 cards', () => {
    expect(validateDeckConstraint(8, 7)).toBe(false);
  });
});

describe('down then up hand sequence', () => {
  it('generates N, N-1, ..., 1, 2, ..., N', () => {
    expect(generateHandSequence(4)).toEqual([4, 3, 2, 1, 2, 3, 4]);
  });

  it('returns only [1] for N=1', () => {
    expect(generateHandSequence(1)).toEqual([1]);
  });

  it('always has length 2N-1 for N>0', () => {
    const n = 7;
    expect(generateHandSequence(n)).toHaveLength((2 * n) - 1);
  });

  it('uses the first R hand sizes from the generated sequence', () => {
    expect(getRoundHandSizes(7, 7)).toEqual([7, 6, 5, 4, 3, 2, 1]);
    expect(getRoundHandSizes(7, 9)).toEqual([7, 6, 5, 4, 3, 2, 1, 2, 3]);
  });

  it('clamps rounds to 2N-1 maximum', () => {
    expect(clampRoundCount(99, 5)).toBe(9);
    expect(getRoundHandSizes(5, 99)).toEqual([5, 4, 3, 2, 1, 2, 3, 4, 5]);
  });
});

describe('suit cycle generation', () => {
  it('uses clubs-start order with NT last', () => {
    expect(generateSuitCycle('clubs', 7)).toEqual(['C', 'D', 'H', 'S', 'NT', 'C', 'D']);
  });

  it('uses spades-start order with NT last', () => {
    expect(generateSuitCycle('spades', 6)).toEqual(['S', 'H', 'D', 'C', 'NT', 'S']);
  });

  it('uses diamonds-start order with NT last', () => {
    expect(generateSuitCycle('diamonds', 7)).toEqual(['D', 'S', 'H', 'C', 'NT', 'D', 'S']);
  });
});

describe('last-bid constraint', () => {
  it('blocks only the forbidden value for the last bidder', () => {
    const bids = [4, 1, 0, 0];
    const handSize = 6;
    const biddingOrder = [1, 2, 3, 0];

    expect(getForbiddenLastBidValue(bids, handSize, biddingOrder)).toBe(5);
    expect(isBidAllowed(0, 5, bids, handSize, biddingOrder)).toBe(false);
    expect(isBidAllowed(0, 4, bids, handSize, biddingOrder)).toBe(true);
    expect(isBidAllowed(2, 5, bids, handSize, biddingOrder)).toBe(true);
  });
});

describe('scoring', () => {
  it('awards tricks plus 10 for exact bid', () => {
    expect(calculateRoundScore(3, 3)).toBe(13);
    expect(calculateRoundScore(3, 2)).toBe(2);
  });

  it('builds round scores and cumulative totals', () => {
    const roundScores = calculateRoundScores([1, 3, 2], [1, 1, 2]);
    expect(roundScores).toEqual([11, 1, 12]);
    expect(calculateTotals([4, 5, 6], roundScores)).toEqual([15, 6, 18]);
  });
});
