import { useEffect, useMemo, useState } from 'react';
import './index.css';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  calculateRoundScores,
  calculateTotals,
  clamp,
  clampRoundCount,
  generateSuitCycle,
  getRoundHandSizes,
  getBiddingOrder,
  getDealerIndex,
  getFirstLeaderIndex,
  getForbiddenLastBidValue,
  validateDeckConstraint,
} from './lib/rules';
import type { Config, GameState, RoundState, UIState } from './types';

const STORAGE_RESUME_KEY = 'estimation-whist-scorer-resume-state';
const STORAGE_CONFIG_KEY = 'estimation-whist-scorer-last-config';
const MAX_STARTING_HAND_PICKER = 26;
const SUIT_GRAPHIC: Record<RoundState['suit'], { label: string; symbol: string; className: string }> = {
  C: { label: 'Clubs', symbol: '♣', className: 'suit-clubs' },
  D: { label: 'Diamonds', symbol: '♦', className: 'suit-diamonds' },
  H: { label: 'Hearts', symbol: '♥', className: 'suit-hearts' },
  S: { label: 'Spades', symbol: '♠', className: 'suit-spades' },
  NT: { label: 'No Trump', symbol: 'NT', className: 'suit-nt' },
};

function createPlayerNames(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `Player ${index + 1}`);
}

function resizePlayerNames(existingNames: string[], count: number): string[] {
  const names = [...existingNames];

  while (names.length < count) {
    names.push(`Player ${names.length + 1}`);
  }

  return names.slice(0, count);
}

function sanitizePlayerName(name: string, index: number): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : `Player ${index + 1}`;
}

function createDefaultConfig(): Config {
  return {
    numberOfPlayers: 4,
    startingHandSize: 7,
    numberOfRounds: 7,
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

function sanitizeConfig(config: Config): Config {
  const numberOfPlayers = clamp(config.numberOfPlayers, MIN_PLAYERS, MAX_PLAYERS);
  const startingHandSize = Math.max(1, Math.floor(config.startingHandSize));
  const numberOfRounds = clampRoundCount(Math.floor(config.numberOfRounds), startingHandSize);
  const playerNames = resizePlayerNames(config.playerNames, numberOfPlayers).map((name, index) =>
    sanitizePlayerName(name, index),
  );
  const firstDealerIndex = clamp(config.firstDealerIndex, 0, numberOfPlayers - 1);

  return {
    numberOfPlayers,
    startingHandSize,
    numberOfRounds,
    suitStart: config.suitStart,
    playerNames,
    firstDealerIndex,
  };
}

function createRounds(config: Config): RoundState[] {
  const hands = getRoundHandSizes(config.startingHandSize, config.numberOfRounds);
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
  return sanitizePlayerName(config.playerNames[index] ?? '', index);
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
      numberOfRounds:
        typeof parsed.numberOfRounds === 'number' ? parsed.numberOfRounds : defaultConfig.numberOfRounds,
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
  const maxRounds = Math.max(1, (config.startingHandSize * 2) - 1);

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

    updateConfig((currentConfig) => ({
      ...currentConfig,
      numberOfPlayers: nextCount,
      playerNames: resizePlayerNames(currentConfig.playerNames, nextCount),
      firstDealerIndex: clamp(currentConfig.firstDealerIndex, 0, nextCount - 1),
    }));
  }

  function onStartingHandSizeChange(value: string) {
    const parsed = Number.parseInt(value, 10);
    const fallback = config.startingHandSize;
    const nextHandSize = Math.max(1, Number.isFinite(parsed) ? parsed : fallback);

    updateConfig((currentConfig) => ({
      ...currentConfig,
      startingHandSize: nextHandSize,
      numberOfRounds: clampRoundCount(currentConfig.numberOfRounds, nextHandSize),
    }));
  }

  function onRoundCountChange(value: string) {
    const parsed = Number.parseInt(value, 10);
    const fallback = config.numberOfRounds;
    const requested = Number.isFinite(parsed) ? parsed : fallback;

    updateConfig((currentConfig) => ({
      ...currentConfig,
      numberOfRounds: clampRoundCount(requested, currentConfig.startingHandSize),
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

      if (!validateDeckConstraint(normalizedConfig.numberOfPlayers, normalizedConfig.startingHandSize)) {
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

  function resetAll() {
    try {
      window.localStorage.removeItem(STORAGE_RESUME_KEY);
      window.localStorage.removeItem(STORAGE_CONFIG_KEY);
    } catch {
      // Ignore storage failures.
    }

    setSavedGameState(null);
    setGameState(createInitialGameState());
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
        <div className="header-top">
          <div className="header-title-block">
            <h1 className="app-title">Estimation Whist Scorer</h1>
            <p className="subtitle">{ui.screen === 'config' ? 'Game Configuration' : 'Live Round Control'}</p>
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
        ) : (
          <p className="subtitle header-hint">Set players, hand size, rounds, suits, and first dealer.</p>
        )}
      </header>

      <main className="app-content">
        {ui.screen === 'config' && (
          <section className="panel">
            <div className="form-grid compact-two-col">
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
                <span>Starting hand (N)</span>
                <select value={config.startingHandSize} onChange={(event) => onStartingHandSizeChange(event.target.value)}>
                  {Array.from({ length: MAX_STARTING_HAND_PICKER }, (_, index) => {
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
                <span>Rounds (1-{maxRounds})</span>
                <select value={config.numberOfRounds} onChange={(event) => onRoundCountChange(event.target.value)}>
                  {Array.from({ length: maxRounds }, (_, index) => {
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
                <span>Suit start</span>
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
                  <option value="clubs">Clubs</option>
                  <option value="spades">Spades</option>
                </select>
              </label>
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
                    {sanitizePlayerName(name, index)}
                  </option>
                ))}
              </select>
            </label>

            <div className="players-grid">
              {config.playerNames.map((name, index) => (
                <label className="field" key={index}>
                  <span>P{index + 1}</span>
                  <input
                    type="text"
                    maxLength={18}
                    value={name}
                    onChange={(event) => onPlayerNameChange(index, event.target.value)}
                  />
                </label>
              ))}
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
                Dealer {getPlayerName(config, currentRound.dealerIndex)} cannot bid {forbiddenLastBid}.
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
            <p className="summary-heading">Current Round</p>
            <table className="summary-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Bid</th>
                  <th>Tricks</th>
                  <th>Round</th>
                  <th>Running</th>
                </tr>
              </thead>
              <tbody>
                {config.playerNames.map((_, playerIndex) => (
                  <tr key={playerIndex}>
                    <td>{getPlayerName(config, playerIndex)}</td>
                    <td>{currentRound.bids[playerIndex]}</td>
                    <td>{currentRound.tricksTaken[playerIndex]}</td>
                    <td>{currentRound.roundScores[playerIndex]}</td>
                    <td>{currentRound.totalsAfterRound[playerIndex]}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="summary-heading">Running Total (All Rounds)</p>
            <div className="running-total-grid">
              {config.playerNames.map((_, playerIndex) => (
                <div className="running-total-item" key={playerIndex}>
                  <span>{getPlayerName(config, playerIndex)}</span>
                  <strong>{currentRound.totalsAfterRound[playerIndex]}</strong>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="app-footer">
        {ui.screen === 'config' && (
          <div className="footer-actions compact-three-col">
            <button type="button" onClick={startGame} disabled={!deckIsValid}>
              Start Game
            </button>

            {savedGameState ? (
              <button type="button" onClick={resumeSavedGame}>
                Resume
              </button>
            ) : (
              <button type="button" disabled>
                Resume
              </button>
            )}

            <button type="button" onClick={resetAll}>
              Reset
            </button>
          </div>
        )}

        {ui.screen === 'bidding' && (
          <div className="footer-actions">
            <button type="button" onClick={beginPlaying} disabled={!biddingStateIsValid}>
              Start Playing
            </button>
          </div>
        )}

        {ui.screen === 'playing' && <p className="footer-note">Tap one winner each trick.</p>}

        {ui.screen === 'summary' && (
          <div className="footer-actions">
            {!isFinalRound ? (
              <button type="button" onClick={moveToNextRound}>
                Next Round
              </button>
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
