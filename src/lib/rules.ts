export type SuitStart = 'clubs' | 'spades';
export type Suit = 'C' | 'D' | 'H' | 'S' | 'NT';

const SUIT_ORDER_CLUBS_START: Suit[] = ['C', 'D', 'H', 'S', 'NT'];
const SUIT_ORDER_SPADES_START: Suit[] = ['S', 'H', 'D', 'C', 'NT'];

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const DECK_SIZE = 52;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function validateDeckConstraint(numberOfPlayers: number, startingHandSize: number): boolean {
  return numberOfPlayers * startingHandSize <= DECK_SIZE;
}

export function generateHandSequence(startingHandSize: number): number[] {
  if (startingHandSize < 1) {
    return [];
  }

  const sequence: number[] = [];

  for (let handSize = startingHandSize; handSize >= 1; handSize -= 1) {
    sequence.push(handSize);
  }

  for (let handSize = 2; handSize <= startingHandSize; handSize += 1) {
    sequence.push(handSize);
  }

  return sequence;
}

export function clampRoundCount(requestedRounds: number, startingHandSize: number): number {
  const maxRounds = Math.max(1, (startingHandSize * 2) - 1);
  return clamp(requestedRounds, 1, maxRounds);
}

export function getRoundHandSizes(startingHandSize: number, requestedRounds: number): number[] {
  const sequence = generateHandSequence(startingHandSize);
  const roundCount = clampRoundCount(requestedRounds, startingHandSize);
  return sequence.slice(0, roundCount);
}

export function generateSuitCycle(start: SuitStart, roundCount: number): Suit[] {
  const baseOrder = start === 'clubs' ? SUIT_ORDER_CLUBS_START : SUIT_ORDER_SPADES_START;
  const suits: Suit[] = [];

  for (let round = 0; round < roundCount; round += 1) {
    suits.push(baseOrder[round % baseOrder.length]);
  }

  return suits;
}

export function getDealerIndex(firstDealerIndex: number, roundIndex: number, numberOfPlayers: number): number {
  return (firstDealerIndex + roundIndex) % numberOfPlayers;
}

export function getBiddingOrder(dealerIndex: number, numberOfPlayers: number): number[] {
  const order: number[] = [];

  for (let offset = 1; offset <= numberOfPlayers; offset += 1) {
    order.push((dealerIndex + offset) % numberOfPlayers);
  }

  return order;
}

export function getFirstLeaderIndex(dealerIndex: number, numberOfPlayers: number): number {
  return (dealerIndex + 1) % numberOfPlayers;
}

export function getForbiddenLastBidValue(bids: number[], handSize: number, biddingOrder: number[]): number | null {
  if (biddingOrder.length === 0) {
    return null;
  }

  const otherBidTotal = biddingOrder
    .slice(0, -1)
    .reduce((total, playerIndex) => total + bids[playerIndex], 0);

  const forbiddenValue = handSize - otherBidTotal;

  if (forbiddenValue >= 0 && forbiddenValue <= handSize) {
    return forbiddenValue;
  }

  return null;
}

export function isBidAllowed(
  playerIndex: number,
  value: number,
  bids: number[],
  handSize: number,
  biddingOrder: number[],
): boolean {
  if (value < 0 || value > handSize) {
    return false;
  }

  if (biddingOrder.length === 0) {
    return true;
  }

  const lastBidderIndex = biddingOrder[biddingOrder.length - 1];

  if (playerIndex !== lastBidderIndex) {
    return true;
  }

  const forbiddenValue = getForbiddenLastBidValue(bids, handSize, biddingOrder);

  return forbiddenValue === null || value !== forbiddenValue;
}

export function calculateRoundScore(bid: number, tricksTaken: number): number {
  return tricksTaken + (bid === tricksTaken ? 10 : 0);
}

export function calculateRoundScores(bids: number[], tricksTaken: number[]): number[] {
  return bids.map((bid, index) => calculateRoundScore(bid, tricksTaken[index]));
}

export function calculateTotals(previousTotals: number[], roundScores: number[]): number[] {
  return roundScores.map((roundScore, index) => previousTotals[index] + roundScore);
}
