import { useEffect, useMemo, useState } from 'react';
import './index.css';
import {
  DECK_SIZE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  calculateRoundScores,
  calculateTotals,
  clamp,
  generateHandSequence,
  generateSuitCycle,
  getBiddingOrder,
  getDealerIndex,
  getFirstLeaderIndex,
  getForbiddenLastBidValue,
  validateDeckConstraint,
} from './lib/rules';
import type { Config, GameState, RoundState, UIState } from './types';

const STORAGE_RESUME_KEY = 'estimation-whist-scorer-resume-state';
const STORAGE_CONFIG_KEY = 'estimation-whist-scorer-last-config';
const APP_VERSION = __APP_VERSION__;
const SUIT_GRAPHIC: Record<RoundState['suit'], { label: string; symbol: string; className: string }> = {
  C: { label: 'Clubs', symbol: '♣', className: 'suit-clubs' },
  D: { label: 'Diamonds', symbol: '♦', className: 'suit-diamonds' },
  H: { label: 'Hearts', symbol: '♥', className: 'suit-hearts' },
  S: { label: 'Spades', symbol: '♠', className: 'suit-spades' },
  NT: { label: 'No Trump', symbol: 'NT', className: 'suit-nt' },
};

function createPlayerNames(count: number): string[] {
  return Array.from({ length: count }, () => '');
}

function resizePlayerNames(existingNames: string[], count: number): string[] {
  const names = [...existingNames];

  while (names.length < count) {
    names.push('');
  }

  return names.slice(0, count);
}

function fallbackPlayerName(name: string, index: number): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : `Player ${index + 1}`;
}

function createDefaultConfig(): Config {
  return {
    numberOfPlayers: 4,
    startingHandSize: 7,
    suitStart: 'clubs',
    playerNames: createPlayerNames(4),
    firstDealerIndex: 0,
  };
}

function createDefaultUI(): UIState {
  return {
    screen: 'config',
    currentRoundIndex: 0,
    currentBidTurn: 0,
    currentTrick: 1,
    currentLeaderIndex: 0,
  };
}

function createInitialGameState(config: Config = createDefaultConfig()): GameState {
  return {
    config,
    rounds: [],
    ui: createDefaultUI(),
  };
}

function getMaxStartingHand(numberOfPlayers: number): number {
  return Math.max(1, Math.floor(DECK_SIZE / numberOfPlayers));
}

function sanitizeConfig(config: Config): Config {
  const numberOfPlayers = clamp(config.numberOfPlayers, MIN_PLAYERS, MAX_PLAYERS);
  const maxStartingHand = getMaxStartingHand(numberOfPlayers);
  const startingHandSize = clamp(Math.floor(config.startingHandSize), 1, maxStartingHand);
  const playerNames = resizePlayerNames(config.playerNames, numberOfPlayers).map((name) => name.trim());
  const firstDealerIndex = clamp(config.firstDealerIndex, 0, numberOfPlayers - 1);

  return {
    numberOfPlayers,
    startingHandSize,
    suitStart: config.suitStart,
    playerNames,
    firstDealerIndex,
  };
}

function createRounds(config: Config): RoundState[] {
  const hands = generateHandSequence(config.startingHandSize);
  const roundCount = hands.length;
  const suits = generateSuitCycle(config.suitStart, roundCount);

  return hands.map((handSize, roundIndex) => ({
    roundIndex,
    handSize,
    suit: suits[roundIndex],
    dealerIndex: getDealerIndex(config.firstDealerIndex, roundIndex, config.numberOfPlayers),
    bids: Array(config.numberOfPlayers).fill(0),
    tricksTaken: Array(config.numberOfPlayers).fill(0),
    roundScores: Array(config.numberOfPlayers).fill(0),
    totalsAfterRound: Array(config.numberOfPlayers).fill(0),
  }));
}

function getPlayerName(config: Config, index: number): string {
  return fallbackPlayerName(config.playerNames[index] ?? '', index);
}

function readSavedGameState(): GameState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_RESUME_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as GameState;

    if (!parsed || typeof parsed !== 'object' || !parsed.config || !parsed.ui || !Array.isArray(parsed.rounds)) {
      return null;
    }
    const sanitizedConfig = sanitizeConfig(parsed.config);
    const activeRound = parsed.rounds[parsed.ui.currentRoundIndex];
    const maxBidTurn = activeRound ? sanitizedConfig.numberOfPlayers : 0;
    const currentBidTurn =
      typeof parsed.ui.currentBidTurn === 'number'
        ? clamp(Math.floor(parsed.ui.currentBidTurn), 0, maxBidTurn)
        : 0;

    return {
      ...parsed,
      config: sanitizedConfig,
      ui: {
        ...parsed.ui,
        currentBidTurn,
      },
    };
  } catch {
    return null;
  }
}

function readSavedConfig(): Config | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_CONFIG_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<Config>;
    const defaultConfig = createDefaultConfig();
    const playerNames =
      Array.isArray(parsed.playerNames) && parsed.playerNames.length > 0
        ? parsed.playerNames.filter((name): name is string => typeof name === 'string')
        : defaultConfig.playerNames;

    const mergedConfig: Config = {
      numberOfPlayers:
        typeof parsed.numberOfPlayers === 'number' ? parsed.numberOfPlayers : defaultConfig.numberOfPlayers,
      startingHandSize:
        typeof parsed.startingHandSize === 'number' ? parsed.startingHandSize : defaultConfig.startingHandSize,
      suitStart: parsed.suitStart === 'spades' ? 'spades' : 'clubs',
      playerNames,
      firstDealerIndex:
        typeof parsed.firstDealerIndex === 'number' ? parsed.firstDealerIndex : defaultConfig.firstDealerIndex,
    };

    return sanitizeConfig(mergedConfig);
  } catch {
    return null;
  }
}

function getBootState(): { savedGameState: GameState | null; initialConfig: Config } {
  const savedGameState = readSavedGameState();
  const savedConfig = readSavedConfig();

  if (savedConfig) {
    return { savedGameState, initialConfig: savedConfig };
  }

  if (savedGameState) {
    return { savedGameState, initialConfig: sanitizeConfig(savedGameState.config) };
  }

  return { savedGameState: null, initialConfig: createDefaultConfig() };
}

function App() {
  const [bootState] = useState(() => getBootState());
  const [savedGameState, setSavedGameState] = useState<GameState | null>(bootState.savedGameState);
  const [gameState, setGameState] = useState<GameState>(() => createInitialGameState(bootState.initialConfig));

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(gameState.config));
    } catch {
      // Ignore storage failures in unsupported contexts.
    }
  }, [gameState.config]);

  useEffect(() => {
    if (gameState.rounds.length === 0) {
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_RESUME_KEY, JSON.stringify(gameState));
      setSavedGameState(gameState);
    } catch {
      // Ignore storage failures in unsupported contexts.
    }
  }, [gameState]);

  const { config, ui } = gameState;
  const currentRound = gameState.rounds[ui.currentRoundIndex];
  const deckIsValid = validateDeckConstraint(config.numberOfPlayers, config.startingHandSize);
  const maxStartingHand = getMaxStartingHand(config.numberOfPlayers);
  const allPlayerNamesProvided = config.playerNames.every((name) => name.trim().length > 0);
  const canStartGame = deckIsValid && allPlayerNamesProvided;

  const biddingOrder = useMemo(() => {
    if (!currentRound) {
      return [];
    }

    return getBiddingOrder(currentRound.dealerIndex, config.numberOfPlayers);
  }, [currentRound, config.numberOfPlayers]);

  const currentBidTurn = currentRound ? clamp(ui.currentBidTurn, 0, biddingOrder.length) : 0;
  const biddingComplete = currentRound ? currentBidTurn >= biddingOrder.length : false;

  const forbiddenLastBid = useMemo(() => {
    if (!currentRound) {
      return null;
    }

    return getForbiddenLastBidValue(currentRound.bids, currentRound.handSize, biddingOrder);
  }, [currentRound, biddingOrder]);

  const lastBidderIndex = biddingOrder.length > 0 ? biddingOrder[biddingOrder.length - 1] : null;
  const biddingStateIsValid = useMemo(() => {
    if (!currentRound || lastBidderIndex === null || !biddingComplete) {
      return false;
    }

    if (forbiddenLastBid === null) {
      return true;
    }

    return currentRound.bids[lastBidderIndex] !== forbiddenLastBid;
  }, [biddingComplete, currentRound, forbiddenLastBid, lastBidderIndex]);

  const lastBidIsInvalid =
    biddingComplete &&
    currentRound !== undefined &&
    lastBidderIndex !== null &&
    forbiddenLastBid !== null &&
    currentRound.bids[lastBidderIndex] === forbiddenLastBid;

  const currentSuitGraphic = currentRound ? SUIT_GRAPHIC[currentRound.suit] : null;
  const setupSuitGraphic = config.suitStart === 'spades' ? SUIT_GRAPHIC.S : SUIT_GRAPHIC.C;
  const cardCornerSuitSymbol = currentSuitGraphic ? currentSuitGraphic.symbol : setupSuitGraphic.symbol;
  const cardCornerSuitClassName = currentSuitGraphic ? currentSuitGraphic.className : setupSuitGraphic.className;
  const leaderboard = useMemo(() => {
    if (!currentRound) {
      return [];
    }

    const completedRounds = gameState.rounds.slice(0, ui.currentRoundIndex + 1);
    const completedRoundCount = completedRounds.length;

    return currentRound.totalsAfterRound
      .map((total, playerIndex) => ({
        playerIndex,
        total,
        bidTotal: completedRounds.reduce((sum, round) => sum + round.bids[playerIndex], 0),
        tricksTotal: completedRounds.reduce((sum, round) => sum + round.tricksTaken[playerIndex], 0),
        zeroBidRounds: completedRounds.reduce((sum, round) => sum + (round.bids[playerIndex] === 0 ? 1 : 0), 0),
        correctBidRounds: completedRounds.reduce(
          (sum, round) => sum + (round.bids[playerIndex] === round.tricksTaken[playerIndex] ? 1 : 0),
          0,
        ),
      }))
      .sort((left, right) => right.total - left.total || left.playerIndex - right.playerIndex)
      .map((entry, index) => ({
        rank: index + 1,
        name: getPlayerName(config, entry.playerIndex),
        total: entry.total,
        bidTotal: entry.bidTotal,
        tricksTotal: entry.tricksTotal,
        bidsVsTricksStatus:
          entry.bidTotal === entry.tricksTotal
            ? 'balanced'
            : entry.bidTotal > entry.tricksTotal
              ? 'bids-over'
              : 'tricks-over',
        zeroBidRate: Math.round((entry.zeroBidRounds / completedRoundCount) * 100),
        correctBidRate: Math.round((entry.correctBidRounds / completedRoundCount) * 100),
      }));
  }, [config, currentRound, gameState.rounds, ui.currentRoundIndex]);

  const headerLine = useMemo(() => {
    if (ui.screen === 'config' || !currentRound) {
      return 'Estimation Whist Scorer';
    }

    if (ui.screen === 'bidding') {
      return `${getPlayerName(config, currentRound.dealerIndex)} to deal ${currentRound.handSize} cards`;
    }

    if (ui.screen === 'playing') {
      return `${getPlayerName(config, ui.currentLeaderIndex)} to lead`;
    }

    const winner = leaderboard[0];
    const runnerUp = leaderboard[1];
    const winningMargin = winner ? winner.total - (runnerUp?.total ?? winner.total) : 0;
    const winningName = winner ? winner.name : getPlayerName(config, 0);

    return `${winningName} wins by ${winningMargin}`;
  }, [config, currentRound, leaderboard, ui.currentLeaderIndex, ui.screen]);

  function getRoleTokens(playerIndex: number): Array<{ key: string; label: string; title: string }> {
    const tokens: Array<{ key: string; label: string; title: string }> = [];

    if (currentRound && playerIndex === currentRound.dealerIndex) {
      tokens.push({ key: 'dealer', label: 'D', title: 'Dealer' });
    }

    return tokens;
  }

  function updateConfig(updater: (currentConfig: Config) => Config) {
    setGameState((previousState) => ({
      ...previousState,
      config: updater(previousState.config),
    }));
  }

  function onPlayerCountChange(value: string) {
    const parsed = Number.parseInt(value, 10);
    const fallback = config.numberOfPlayers;
    const nextCount = clamp(Number.isFinite(parsed) ? parsed : fallback, MIN_PLAYERS, MAX_PLAYERS);
    const nextMaxStartingHand = getMaxStartingHand(nextCount);

    updateConfig((currentConfig) => ({
      ...currentConfig,
      numberOfPlayers: nextCount,
      startingHandSize: clamp(currentConfig.startingHandSize, 1, nextMaxStartingHand),
      playerNames: resizePlayerNames(currentConfig.playerNames, nextCount),
      firstDealerIndex: clamp(currentConfig.firstDealerIndex, 0, nextCount - 1),
    }));
  }

  function onStartingHandSizeChange(value: string) {
    const parsed = Number.parseInt(value, 10);
    const fallback = config.startingHandSize;
    const nextHandSize = clamp(Number.isFinite(parsed) ? parsed : fallback, 1, maxStartingHand);

    updateConfig((currentConfig) => ({
      ...currentConfig,
      startingHandSize: nextHandSize,
    }));
  }

  function onPlayerNameChange(index: number, value: string) {
    updateConfig((currentConfig) => {
      const nextNames = [...currentConfig.playerNames];
      nextNames[index] = value;

      return {
        ...currentConfig,
        playerNames: nextNames,
      };
    });
  }

  function startGame() {
    setGameState((previousState) => {
      const normalizedConfig = sanitizeConfig(previousState.config);
      const hasAllNames = normalizedConfig.playerNames.every((name) => name.trim().length > 0);

      if (!hasAllNames || !validateDeckConstraint(normalizedConfig.numberOfPlayers, normalizedConfig.startingHandSize)) {
        return previousState;
      }

      const rounds = createRounds(normalizedConfig);
      const firstRound = rounds[0];

      if (!firstRound) {
        return previousState;
      }

      return {
        config: normalizedConfig,
        rounds,
        ui: {
          screen: 'bidding',
          currentRoundIndex: 0,
          currentBidTurn: 0,
          currentTrick: 1,
          currentLeaderIndex: getFirstLeaderIndex(firstRound.dealerIndex, normalizedConfig.numberOfPlayers),
        },
      };
    });
  }

  function resumeSavedGame() {
    if (!savedGameState) {
      return;
    }

    setGameState(savedGameState);
  }

  function selectBidForCurrentPlayer(value: number) {
    setGameState((previousState) => {
      const roundIndex = previousState.ui.currentRoundIndex;
      const round = previousState.rounds[roundIndex];

      if (!round || value < 0 || value > round.handSize) {
        return previousState;
      }

      const order = getBiddingOrder(round.dealerIndex, previousState.config.numberOfPlayers);
      const bidTurn = clamp(previousState.ui.currentBidTurn, 0, order.length);
      const playerIndex = order[bidTurn];

      if (playerIndex === undefined) {
        return previousState;
      }

      const lastPlayerIndex = order[order.length - 1] ?? null;
      const forbidden = getForbiddenLastBidValue(round.bids, round.handSize, order);
      const isForbidden = playerIndex === lastPlayerIndex && forbidden !== null && value === forbidden;

      if (isForbidden) {
        return previousState;
      }

      const nextBids = [...round.bids];
      nextBids[playerIndex] = value;

      const nextRounds = [...previousState.rounds];
      nextRounds[roundIndex] = {
        ...round,
        bids: nextBids,
      };

      return {
        ...previousState,
        rounds: nextRounds,
        ui: {
          ...previousState.ui,
          currentBidTurn: clamp(bidTurn + 1, 0, order.length),
        },
      };
    });
  }

  function goToPreviousBidder() {
    setGameState((previousState) => {
      if (previousState.ui.currentBidTurn <= 0) {
        return previousState;
      }

      return {
        ...previousState,
        ui: {
          ...previousState.ui,
          currentBidTurn: previousState.ui.currentBidTurn - 1,
        },
      };
    });
  }

  function beginPlaying() {
    setGameState((previousState) => {
      const round = previousState.rounds[previousState.ui.currentRoundIndex];

      if (!round) {
        return previousState;
      }

      const order = getBiddingOrder(round.dealerIndex, previousState.config.numberOfPlayers);
      const bidTurn = clamp(previousState.ui.currentBidTurn, 0, order.length);
      const lastPlayerIndex = order[order.length - 1] ?? null;
      const forbidden = getForbiddenLastBidValue(round.bids, round.handSize, order);
      const bidsAreComplete = bidTurn >= order.length;
      const lastBidValid =
        lastPlayerIndex === null ||
        forbidden === null ||
        round.bids[lastPlayerIndex] !== forbidden;

      if (!bidsAreComplete || !lastBidValid) {
        return previousState;
      }

      return {
        ...previousState,
        ui: {
          ...previousState.ui,
          screen: 'playing',
          currentTrick: 1,
          currentLeaderIndex: getFirstLeaderIndex(round.dealerIndex, previousState.config.numberOfPlayers),
        },
      };
    });
  }

  function recordTrickWinner(winnerIndex: number) {
    setGameState((previousState) => {
      const roundIndex = previousState.ui.currentRoundIndex;
      const round = previousState.rounds[roundIndex];

      if (!round) {
        return previousState;
      }

      const nextTricksTaken = [...round.tricksTaken];
      nextTricksTaken[winnerIndex] += 1;

      const nextRounds = [...previousState.rounds];
      const roundCompleted = previousState.ui.currentTrick >= round.handSize;

      let updatedRound: RoundState = {
        ...round,
        tricksTaken: nextTricksTaken,
      };

      let nextUI: UIState = {
        ...previousState.ui,
        currentLeaderIndex: winnerIndex,
      };

      if (roundCompleted) {
        const roundScores = calculateRoundScores(round.bids, nextTricksTaken);
        const previousTotals =
          roundIndex === 0
            ? Array(previousState.config.numberOfPlayers).fill(0)
            : previousState.rounds[roundIndex - 1].totalsAfterRound;
        const totalsAfterRound = calculateTotals(previousTotals, roundScores);

        updatedRound = {
          ...updatedRound,
          roundScores,
          totalsAfterRound,
        };

        nextUI = {
          ...nextUI,
          screen: 'summary',
        };
      } else {
        nextUI = {
          ...nextUI,
          currentTrick: previousState.ui.currentTrick + 1,
        };
      }

      nextRounds[roundIndex] = updatedRound;

      return {
        ...previousState,
        rounds: nextRounds,
        ui: nextUI,
      };
    });
  }

  function moveToNextRound() {
    setGameState((previousState) => {
      const nextRoundIndex = previousState.ui.currentRoundIndex + 1;
      const nextRound = previousState.rounds[nextRoundIndex];

      if (!nextRound) {
        return previousState;
      }

      return {
        ...previousState,
        ui: {
          screen: 'bidding',
          currentRoundIndex: nextRoundIndex,
          currentBidTurn: 0,
          currentTrick: 1,
          currentLeaderIndex: getFirstLeaderIndex(nextRound.dealerIndex, previousState.config.numberOfPlayers),
        },
      };
    });
  }

  function canQuitFromCurrentScreen(): boolean {
    if (ui.screen !== 'bidding' && ui.screen !== 'playing') {
      return true;
    }

    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) {
      return true;
    }

    if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
      return true;
    }

    const message =
      ui.screen === 'playing'
        ? 'Quit now and score the current round based on tricks already recorded?'
        : 'Quit now and return to summary?';

    try {
      return window.confirm(message);
    } catch {
      return true;
    }
  }

  function quitGame() {
    if (!canQuitFromCurrentScreen()) {
      return;
    }

    setGameState((previousState) => {
      const roundIndex = previousState.ui.currentRoundIndex;
      const playerCount = previousState.config.numberOfPlayers;
      const zeroTotals = Array(playerCount).fill(0);
      let nextRounds: RoundState[] = [];

      if (previousState.ui.screen === 'bidding') {
        nextRounds = previousState.rounds.slice(0, roundIndex);
      } else if (previousState.ui.screen === 'playing') {
        const round = previousState.rounds[roundIndex];

        if (!round) {
          return previousState;
        }

        nextRounds = previousState.rounds.slice(0, roundIndex + 1);

        const roundScores = calculateRoundScores(round.bids, round.tricksTaken);
        const previousTotals = roundIndex === 0 ? zeroTotals : nextRounds[roundIndex - 1].totalsAfterRound;
        const totalsAfterRound = calculateTotals(previousTotals, roundScores);

        nextRounds[roundIndex] = {
          ...round,
          roundScores,
          totalsAfterRound,
        };
      } else if (previousState.ui.screen === 'summary') {
        nextRounds = previousState.rounds.slice(0, roundIndex + 1);
      } else {
        return previousState;
      }

      if (nextRounds.length === 0) {
        const firstRound = previousState.rounds[0];
        const firstSuit = generateSuitCycle(previousState.config.suitStart, 1)[0];
        nextRounds = [
          {
            roundIndex: 0,
            handSize: firstRound ? firstRound.handSize : previousState.config.startingHandSize,
            suit: firstRound ? firstRound.suit : firstSuit,
            dealerIndex: firstRound ? firstRound.dealerIndex : previousState.config.firstDealerIndex,
            bids: Array(playerCount).fill(0),
            tricksTaken: Array(playerCount).fill(0),
            roundScores: Array(playerCount).fill(0),
            totalsAfterRound: zeroTotals,
          },
        ];
      }

      const finalRoundIndex = nextRounds.length - 1;
      const finalRound = nextRounds[finalRoundIndex];

      return {
        ...previousState,
        rounds: nextRounds,
        ui: {
          ...previousState.ui,
          screen: 'summary',
          currentRoundIndex: finalRoundIndex,
          currentBidTurn: 0,
          currentTrick: 1,
          currentLeaderIndex: getFirstLeaderIndex(finalRound.dealerIndex, playerCount),
        },
      };
    });
  }

  function newGame() {
    setGameState((previousState) => ({
      config: sanitizeConfig(previousState.config),
      rounds: [],
      ui: createDefaultUI(),
    }));
  }

  const isFinalRound = ui.currentRoundIndex >= gameState.rounds.length - 1;
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">{headerLine}</h1>
      </header>

      <main className={`app-content screen-${ui.screen}`}>
        {ui.screen === 'config' && (
          <section className="panel config-panel">
            <div className="form-grid config-main-fields">
              <label className="field">
                <span>Players (2-8)</span>
                <select value={config.numberOfPlayers} onChange={(event) => onPlayerCountChange(event.target.value)}>
                  {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, offset) => {
                    const value = MIN_PLAYERS + offset;
                    return (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    );
                  })}
                </select>
              </label>

              <label className="field">
                <span>Starting hand</span>
                <select value={config.startingHandSize} onChange={(event) => onStartingHandSizeChange(event.target.value)}>
                  {Array.from({ length: maxStartingHand }, (_, index) => {
                    const value = index + 1;
                    return (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    );
                  })}
                </select>
              </label>

              <label className="field">
                <span className="field-inline">
                  Start suit
                  <span className={`mini-suit mini-suit-contrast ${config.suitStart === 'clubs' ? 'suit-clubs' : 'suit-spades'}`}>
                    {config.suitStart === 'clubs' ? '♧' : '♤'}
                  </span>
                </span>
                <select
                  value={config.suitStart}
                  onChange={(event) => {
                    const nextSuitStart = event.target.value === 'spades' ? 'spades' : 'clubs';

                    updateConfig((currentConfig) => ({
                      ...currentConfig,
                      suitStart: nextSuitStart,
                    }));
                  }}
                >
                  <option value="clubs">♧ Clubs</option>
                  <option value="spades">♤ Spades</option>
                </select>
              </label>
            </div>

            <div className="config-players-section">
              <p className="section-caption">Players</p>

              <div className="players-grid">
                {config.playerNames.map((name, index) => (
                  <label className="field" key={index}>
                    <span>P{index + 1}</span>
                    <input
                      type="text"
                      maxLength={18}
                      value={name}
                      placeholder={`Player ${index + 1}`}
                      onChange={(event) => onPlayerNameChange(index, event.target.value)}
                    />
                  </label>
                ))}
              </div>

              <label className="field">
                <span>First dealer</span>
                <select
                  value={config.firstDealerIndex}
                  onChange={(event) => {
                    const nextIndex = Number.parseInt(event.target.value, 10);

                    updateConfig((currentConfig) => ({
                      ...currentConfig,
                      firstDealerIndex: clamp(
                        Number.isFinite(nextIndex) ? nextIndex : currentConfig.firstDealerIndex,
                        0,
                        currentConfig.numberOfPlayers - 1,
                      ),
                    }));
                  }}
                >
                  {config.playerNames.map((name, index) => (
                    <option key={index} value={index}>
                      {fallbackPlayerName(name, index)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {!deckIsValid && (
              <p className="error-message">
                Invalid deck setup: players × starting hand must be 52 or less.
              </p>
            )}
          </section>
        )}

        {ui.screen === 'bidding' && currentRound && (
          <section className="panel bidding-panel">
            {lastBidderIndex !== null && forbiddenLastBid !== null && (
              <p className="bidding-banner">
                {getPlayerName(config, lastBidderIndex)} cannot bid {forbiddenLastBid}.
              </p>
            )}

            {lastBidIsInvalid && lastBidderIndex !== null && (
              <p className="error-message bidding-warning">
                Total bids cannot equal {currentRound.handSize}. {getPlayerName(config, lastBidderIndex)} must change bid.
              </p>
            )}

            <div className={`bidding-progress-list${!biddingComplete ? ' has-active-turn' : ''}`} aria-label="Bid order progress">
              {biddingOrder.map((playerIndex, orderIndex) => {
                const isDone = orderIndex < currentBidTurn;
                const isCurrent = !biddingComplete && orderIndex === currentBidTurn;
                const bidValue = currentRound.bids[playerIndex];
                const roleTokens = getRoleTokens(playerIndex);

                return (
                  <div
                    className={`bidding-progress-row${isDone ? ' is-done' : ''}${isCurrent ? ' is-current' : ''}${
                      roleTokens.some((token) => token.key === 'dealer') ? ' is-dealer' : ''
                    }`}
                    key={playerIndex}
                  >
                    <div className="bidding-progress-main">
                      <span className="bidding-progress-order">{orderIndex + 1}.</span>
                      <span className="bidding-progress-name-group">
                        <span className="bidding-progress-name">{getPlayerName(config, playerIndex)}</span>
                        {isCurrent && <span className="bidding-current-pill">Current bidder</span>}
                        {roleTokens.length > 0 && (
                          <span className="role-token-row">
                            {roleTokens.map((token) => (
                              <span key={token.key} className={`role-token is-${token.key}`} title={token.title} aria-label={token.title}>
                                {token.label}
                              </span>
                            ))}
                          </span>
                        )}
                      </span>
                      <span className="bidding-progress-bid">{isDone ? bidValue : '—'}</span>
                    </div>

                    {isCurrent && (
                      <div className="bid-options-grid" role="group" aria-label={`Bid options for ${getPlayerName(config, playerIndex)}`}>
                        {Array.from({ length: currentRound.handSize + 1 }, (_, value) => {
                          const isForbiddenOption =
                            playerIndex === lastBidderIndex &&
                            forbiddenLastBid !== null &&
                            value === forbiddenLastBid;
                          const isSelectedOption = bidValue === value;

                          return (
                            <button
                              type="button"
                              key={value}
                              className={`bid-option ${cardCornerSuitClassName}${isSelectedOption ? ' is-selected' : ''}${
                                isForbiddenOption ? ' is-forbidden' : ''
                              }`}
                              data-card={value}
                              data-suit={cardCornerSuitSymbol}
                              onClick={() => selectBidForCurrentPlayer(value)}
                              disabled={isForbiddenOption}
                              aria-label={`Bid ${value}`}
                            >
                              {value}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="bidding-turn-actions">
              <button type="button" onClick={goToPreviousBidder} className="secondary-button" disabled={currentBidTurn === 0}>
                Back
              </button>
              <p className="bidding-turn-status">{biddingComplete ? 'All bids selected' : 'Choose a bid to continue'}</p>
            </div>
          </section>
        )}

        {ui.screen === 'playing' && currentRound && (
          <section className="panel playing-panel">
            <p className="subtitle">Who wins the trick?</p>
            <div className="winner-grid">
              {config.playerNames.map((_, index) => {
                const tricksSoFar = currentRound.tricksTaken[index];
                const contract = currentRound.bids[index];
                const progressClass =
                  tricksSoFar < contract ? 'is-under' : tricksSoFar > contract ? 'is-over' : 'is-on';
                const roleTokens = getRoleTokens(index);
                const hasDealerToken = roleTokens.some((token) => token.key === 'dealer');

                return (
                  <button
                    key={index}
                    type="button"
                    className={`winner-button${hasDealerToken ? ' is-dealer' : ''}`}
                    onClick={() => recordTrickWinner(index)}
                  >
                    <span className={`winner-progress ${progressClass}`} aria-label={`Tricks ${tricksSoFar}, bid ${contract}`}>
                      <span
                        className={`winner-mini-card winner-mini-card-tricks ${cardCornerSuitClassName}`}
                        data-suit={cardCornerSuitSymbol}
                      >
                        <span className="winner-mini-card-value">{tricksSoFar}</span>
                      </span>
                      <span className={`winner-mini-card winner-mini-card-bid ${cardCornerSuitClassName}`} data-suit={cardCornerSuitSymbol}>
                        <span className="winner-mini-card-value">{contract}</span>
                      </span>
                    </span>
                    <span className="winner-name-row">
                      <span className="winner-name">{getPlayerName(config, index)}</span>
                      {roleTokens.length > 0 && (
                        <span className="role-token-row">
                          {roleTokens.map((token) => (
                            <span key={token.key} className={`role-token is-${token.key}`} title={token.title} aria-label={token.title}>
                              {token.label}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {ui.screen === 'summary' && currentRound && (
          <section className="panel summary-panel">
            {!isFinalRound && (
              <>
                <p className="summary-heading">Current Round</p>
                <table className="table-felt summary-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Bid</th>
                      <th>Tricks</th>
                      <th>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {config.playerNames.map((_, playerIndex) => (
                      <tr key={playerIndex}>
                        <td>{getPlayerName(config, playerIndex)}</td>
                        <td>{currentRound.bids[playerIndex]}</td>
                        <td>{currentRound.tricksTaken[playerIndex]}</td>
                        <td>{currentRound.roundScores[playerIndex]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <p className="summary-heading">Leaderboard</p>
            <table className="table-felt leaderboard-table">
              <thead>
                <tr>
                  <th className="leaderboard-col-rank">#</th>
                  <th className="leaderboard-col-player">Player</th>
                  <th className="leaderboard-col-bt">B:T</th>
                  <th className="leaderboard-col-rate">Z0%</th>
                  <th className="leaderboard-col-rate">Hit%</th>
                  <th className="leaderboard-col-score">Tot</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry) => (
                  <tr key={`${entry.rank}-${entry.name}`}>
                    <td className="leaderboard-col-rank">{entry.rank}</td>
                    <td className="leaderboard-col-player">{entry.name}</td>
                    <td className={`leaderboard-col-bt leaderboard-ou-${entry.bidsVsTricksStatus}`}>
                      {`${entry.bidTotal}:${entry.tricksTotal}`}
                      {entry.bidsVsTricksStatus === 'balanced' && <span className="leaderboard-ou-star" aria-hidden="true"> ★</span>}
                      {entry.bidsVsTricksStatus === 'tricks-over' && <span className="leaderboard-ou-arrow" aria-hidden="true"> ↓</span>}
                      {entry.bidsVsTricksStatus === 'bids-over' && <span className="leaderboard-ou-arrow" aria-hidden="true"> ↑</span>}
                    </td>
                    <td className="leaderboard-col-rate">{entry.zeroBidRate}%</td>
                    <td className="leaderboard-col-rate">{entry.correctBidRate}%</td>
                    <td className="leaderboard-col-score">{entry.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {isFinalRound && (
              <>
                <p className="summary-heading">Game Summary By Round</p>
                <table className="table-felt game-summary-table">
                  <thead>
                    <tr>
                      <th>R</th>
                      <th>Suit</th>
                      <th>Cards</th>
                      <th>Dealer</th>
                      {config.playerNames.map((_, playerIndex) => (
                        <th key={playerIndex}>{getPlayerName(config, playerIndex)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {gameState.rounds.map((round) => (
                      <tr key={round.roundIndex}>
                        <td>{round.roundIndex + 1}</td>
                        <td>
                          <span
                            className={`summary-suit-icon ${SUIT_GRAPHIC[round.suit].className}`}
                            title={SUIT_GRAPHIC[round.suit].label}
                            aria-label={SUIT_GRAPHIC[round.suit].label}
                          >
                            {SUIT_GRAPHIC[round.suit].symbol}
                          </span>
                        </td>
                        <td>{round.handSize}</td>
                        <td>{getPlayerName(config, round.dealerIndex)}</td>
                        {round.roundScores.map((score, playerIndex) => (
                          <td key={`${round.roundIndex}-${playerIndex}`}>{score}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>
        )}
      </main>

      <footer className="app-footer">
        {ui.screen === 'config' && (
          <div className="footer-actions config-two-col">
            <p className="footer-version">Version {APP_VERSION}</p>
            {savedGameState ? (
              <button type="button" onClick={resumeSavedGame}>
                Resume
              </button>
            ) : (
              <button type="button" disabled>
                Resume
              </button>
            )}

            <button type="button" className="primary-action" onClick={startGame} disabled={!canStartGame}>
              Start Game
            </button>
          </div>
        )}

        {ui.screen === 'bidding' && (
          <div className="footer-actions config-two-col">
            <button type="button" onClick={quitGame} className="secondary-button">
              Quit Game
            </button>

            <button type="button" className="primary-action" onClick={beginPlaying} disabled={!biddingStateIsValid}>
              Start Playing
            </button>
          </div>
        )}

        {ui.screen === 'playing' && (
          <div className="footer-actions">
            <button type="button" onClick={quitGame} className="secondary-button">
              Quit Game
            </button>
          </div>
        )}

        {ui.screen === 'summary' && (
          <div className={`footer-actions${!isFinalRound ? ' config-two-col' : ''}`}>
            {!isFinalRound ? (
              <>
                <button type="button" onClick={quitGame} className="secondary-button">
                  Quit Game
                </button>

                <button type="button" className="primary-action" onClick={moveToNextRound}>
                  Next Round
                </button>
              </>
            ) : (
              <>
                <p className="footer-note">Game Over</p>
                <button type="button" className="primary-action" onClick={newGame}>
                  New Game
                </button>
              </>
            )}
          </div>
        )}
      </footer>
    </div>
  );
}

export default App;
