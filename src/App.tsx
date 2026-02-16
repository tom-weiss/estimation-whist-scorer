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
const APP_VERSION = '1.1.0';
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

    return parsed;
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

  const forbiddenLastBid = useMemo(() => {
    if (!currentRound) {
      return null;
    }

    return getForbiddenLastBidValue(currentRound.bids, currentRound.handSize, biddingOrder);
  }, [currentRound, biddingOrder]);

  const lastBidderIndex = biddingOrder.length > 0 ? biddingOrder[biddingOrder.length - 1] : null;
  const biddingStateIsValid = useMemo(() => {
    if (!currentRound || lastBidderIndex === null) {
      return false;
    }

    if (forbiddenLastBid === null) {
      return true;
    }

    return currentRound.bids[lastBidderIndex] !== forbiddenLastBid;
  }, [currentRound, forbiddenLastBid, lastBidderIndex]);

  const lastBidIsInvalid =
    currentRound !== undefined &&
    lastBidderIndex !== null &&
    forbiddenLastBid !== null &&
    currentRound.bids[lastBidderIndex] === forbiddenLastBid;

  const currentSuitGraphic = currentRound ? SUIT_GRAPHIC[currentRound.suit] : null;
  const leaderboard = useMemo(() => {
    if (!currentRound) {
      return [];
    }

    const completedRounds = gameState.rounds.slice(0, ui.currentRoundIndex + 1);

    return currentRound.totalsAfterRound
      .map((total, playerIndex) => ({
        playerIndex,
        total,
        bidTotal: completedRounds.reduce((sum, round) => sum + round.bids[playerIndex], 0),
        tricksTotal: completedRounds.reduce((sum, round) => sum + round.tricksTaken[playerIndex], 0),
      }))
      .sort((left, right) => right.total - left.total || left.playerIndex - right.playerIndex)
      .map((entry, index) => ({
        rank: index + 1,
        name: getPlayerName(config, entry.playerIndex),
        total: entry.total,
        // Running over/under overall: positive means won more tricks than bid overall.
        overUnder: entry.tricksTotal - entry.bidTotal,
      }));
  }, [config, currentRound, gameState.rounds, ui.currentRoundIndex]);

  const headerInfo = useMemo(() => {
    if (!currentRound || ui.screen === 'config') {
      return [];
    }

    const info = [
      { label: 'Round', value: `${ui.currentRoundIndex + 1}/${gameState.rounds.length}` },
      { label: 'Hand', value: `${currentRound.handSize}` },
      { label: 'Dealer', value: getPlayerName(config, currentRound.dealerIndex) },
    ];

    if (ui.screen === 'playing') {
      info.push({ label: 'Trick', value: `${ui.currentTrick}/${currentRound.handSize}` });
      info.push({ label: 'Leader', value: getPlayerName(config, ui.currentLeaderIndex) });
    }

    return info;
  }, [config, currentRound, gameState.rounds.length, ui.currentLeaderIndex, ui.currentRoundIndex, ui.currentTrick, ui.screen]);

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

  function setBid(playerIndex: number, value: number) {
    setGameState((previousState) => {
      const roundIndex = previousState.ui.currentRoundIndex;
      const round = previousState.rounds[roundIndex];

      if (!round) {
        return previousState;
      }

      if (value < 0 || value > round.handSize) {
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
      };
    });
  }

  function beginPlaying() {
    setGameState((previousState) => {
      const round = previousState.rounds[previousState.ui.currentRoundIndex];

      if (!round) {
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
          currentTrick: 1,
          currentLeaderIndex: getFirstLeaderIndex(nextRound.dealerIndex, previousState.config.numberOfPlayers),
        },
      };
    });
  }

  function quitGame() {
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
  const screenLabel =
    ui.screen === 'config'
      ? 'Game Setup'
      : ui.screen === 'bidding'
        ? 'Bidding'
        : ui.screen === 'playing'
          ? 'Playing'
          : 'Summary';

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-top">
          <div className="header-title-block">
            <h1 className="app-title">{`Estimation Whist Scorer: ${screenLabel}`}</h1>
            <p className="subtitle">{ui.screen === 'config' ? 'Game Configuration' : 'Live Round Control'}</p>
            {ui.screen === 'config' && <p className="version-label">Version {APP_VERSION}</p>}
          </div>

          <div className="header-badges">
            {currentSuitGraphic ? (
              <div className={`suit-card ${currentSuitGraphic.className}`} aria-label={`Current suit ${currentSuitGraphic.label}`}>
                <span className="suit-symbol">{currentSuitGraphic.symbol}</span>
                <span className="suit-name">{currentSuitGraphic.label}</span>
              </div>
            ) : (
              <div className="suit-card suit-setup" aria-label="Setup stage">
                <span className="suit-symbol">🂠</span>
                <span className="suit-name">Setup</span>
              </div>
            )}

            <div className="hand-card" aria-label={`Hand size ${currentRound ? currentRound.handSize : config.startingHandSize}`}>
              <span className="hand-label">Hand</span>
              <span className="hand-value">{currentRound ? currentRound.handSize : config.startingHandSize}</span>
            </div>
          </div>
        </div>

        {headerInfo.length > 0 ? (
          <div className="header-info-grid">
            {headerInfo.map((item) => (
              <div className="info-tile" key={item.label}>
                <span className="info-label">{item.label}</span>
                <span className="info-value">{item.value}</span>
              </div>
            ))}
          </div>
        ) : null}
      </header>

      <main className="app-content">
        {ui.screen === 'config' && (
          <section className="panel">
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
                  <span className={`mini-suit ${config.suitStart === 'clubs' ? 'suit-clubs' : 'suit-spades'}`}>
                    {config.suitStart === 'clubs' ? '♣' : '♠'}
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
                  <option value="clubs">♣ Clubs</option>
                  <option value="spades">♠ Spades</option>
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
          <section className="panel">
            {forbiddenLastBid !== null && (
              <p className="bidding-banner">
                {getPlayerName(config, currentRound.dealerIndex)} cannot bid {forbiddenLastBid}.
              </p>
            )}

            {lastBidIsInvalid && lastBidderIndex !== null && (
              <p className="error-message bidding-warning">
                Total bids cannot equal {currentRound.handSize}. {getPlayerName(config, lastBidderIndex)} must change bid.
              </p>
            )}
            <div className="rows-list">
              {biddingOrder.map((playerIndex) => {
                const bidValue = currentRound.bids[playerIndex];
                const canDecrement = bidValue > 0;
                const canIncrement = bidValue < currentRound.handSize;
                const isLastBidder = playerIndex === biddingOrder[biddingOrder.length - 1];
                const isForbiddenBid = isLastBidder && forbiddenLastBid !== null && bidValue === forbiddenLastBid;

                return (
                  <div className="player-row" key={playerIndex}>
                    <span className="player-name">{getPlayerName(config, playerIndex)}</span>

                    <div className="stepper" role="group" aria-label={`Bid for ${getPlayerName(config, playerIndex)}`}>
                      <button
                        type="button"
                        onClick={() => setBid(playerIndex, bidValue - 1)}
                        disabled={!canDecrement}
                      >
                        -
                      </button>

                      <span className="stepper-value">{bidValue}</span>

                      <button
                        type="button"
                        onClick={() => setBid(playerIndex, bidValue + 1)}
                        disabled={!canIncrement}
                      >
                        +
                      </button>
                    </div>

                    {isLastBidder && forbiddenLastBid !== null && (
                      <p className={isForbiddenBid ? 'helper-text helper-text-error' : 'helper-text'}>
                        Last bidder cannot choose {forbiddenLastBid}.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {ui.screen === 'playing' && currentRound && (
          <section className="panel">
            <p className="subtitle">Who wins the trick?</p>
            <div className="winner-grid">
              {config.playerNames.map((_, index) => {
                const tricksSoFar = currentRound.tricksTaken[index];
                const contract = currentRound.bids[index];
                const progressClass =
                  tricksSoFar < contract ? 'is-under' : tricksSoFar > contract ? 'is-over' : 'is-on';

                return (
                  <button key={index} type="button" className="winner-button" onClick={() => recordTrickWinner(index)}>
                    <span className="winner-name">{getPlayerName(config, index)}</span>
                    <span className={`winner-progress ${progressClass}`}>{`${tricksSoFar}/${contract}`}</span>
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
                <table className="summary-table">
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
            <div className="leaderboard-list">
              <div className="leaderboard-row leaderboard-head">
                <span className="leaderboard-rank">#</span>
                <span className="leaderboard-name">Player</span>
                <span className="leaderboard-ou">O/UΣ</span>
                <span className="leaderboard-score">Total</span>
              </div>
              {leaderboard.map((entry) => (
                <div className="leaderboard-row" key={`${entry.rank}-${entry.name}`}>
                  <span className="leaderboard-rank">{entry.rank}</span>
                  <span className="leaderboard-name">{entry.name}</span>
                  <span className="leaderboard-ou">
                    {entry.overUnder === 0 ? 'E' : entry.overUnder > 0 ? `O${entry.overUnder}` : `U${Math.abs(entry.overUnder)}`}
                  </span>
                  <strong className="leaderboard-score">{entry.total}</strong>
                </div>
              ))}
            </div>

            {isFinalRound && (
              <>
                <p className="summary-heading">Game Summary By Round</p>
                <table className="game-summary-table">
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
            {savedGameState ? (
              <button type="button" onClick={resumeSavedGame}>
                Resume
              </button>
            ) : (
              <button type="button" disabled>
                Resume
              </button>
            )}

            <button type="button" onClick={startGame} disabled={!canStartGame}>
              Start Game
            </button>
          </div>
        )}

        {ui.screen === 'bidding' && (
          <div className="footer-actions config-two-col">
            <button type="button" onClick={quitGame} className="secondary-button">
              Quit Game
            </button>

            <button type="button" onClick={beginPlaying} disabled={!biddingStateIsValid}>
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

                <button type="button" onClick={moveToNextRound}>
                  Next Round
                </button>
              </>
            ) : (
              <>
                <p className="footer-note">Game Over</p>
                <button type="button" onClick={newGame}>
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
