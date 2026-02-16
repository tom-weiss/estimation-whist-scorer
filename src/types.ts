import type { Suit, SuitStart } from './lib/rules';

export type Screen = 'config' | 'bidding' | 'playing' | 'summary';

export interface Config {
  numberOfPlayers: number;
  startingHandSize: number;
  suitStart: SuitStart;
  playerNames: string[];
  firstDealerIndex: number;
}

export interface RoundState {
  roundIndex: number;
  handSize: number;
  suit: Suit;
  dealerIndex: number;
  bids: number[];
  tricksTaken: number[];
  roundScores: number[];
  totalsAfterRound: number[];
}

export interface UIState {
  screen: Screen;
  currentRoundIndex: number;
  currentTrick: number;
  currentLeaderIndex: number;
}

export interface GameState {
  config: Config;
  rounds: RoundState[];
  ui: UIState;
}
