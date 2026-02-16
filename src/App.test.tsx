import { fireEvent, render, screen, within } from '@testing-library/react';
import App from './App';

function fillRequiredNames() {
  fireEvent.change(screen.getByRole('textbox', { name: 'P1' }), { target: { value: 'Tom' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'P2' }), { target: { value: 'Jane' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'P3' }), { target: { value: 'Tristan' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'P4' }), { target: { value: 'Freya' } });
}

function completeBiddingWithZero(numberOfPlayers: number) {
  for (let index = 0; index < numberOfPlayers; index += 1) {
    fireEvent.click(screen.getByRole('button', { name: 'Bid 0' }));
  }
}

function startPlayingRound() {
  fillRequiredNames();
  fireEvent.click(screen.getByRole('button', { name: 'Start Game' }));
  completeBiddingWithZero(4);
}

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders the configuration screen by default', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Estimation Whist Scorer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Game' })).toBeInTheDocument();
  });

  it('allows quitting the game during play and jumps to final summary', () => {
    render(<App />);

    fillRequiredNames();

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }));
    expect(screen.getByRole('heading', { name: 'Tom to deal 7 cards for Clubs' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quit Game' })).toBeInTheDocument();
    completeBiddingWithZero(4);
    expect(screen.getByRole('heading', { name: '7 hands to go: Jane to lead' })).toBeInTheDocument();

    const quitButton = screen.getByRole('button', { name: 'Quit Game' });
    expect(quitButton).toBeInTheDocument();
    fireEvent.click(quitButton);

    expect(screen.getByRole('heading', { name: /wins by \d+$/ })).toBeInTheDocument();
    expect(screen.getByText('Leaderboard')).toBeInTheDocument();
    expect(screen.getByText('Scores for that round')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Game' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next Round' })).not.toBeInTheDocument();
  });

  it('shows Quit Game on non-final summary next round screen', () => {
    render(<App />);

    fillRequiredNames();
    fireEvent.change(screen.getByRole('combobox', { name: 'Starting hand' }), { target: { value: '2' } });

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }));
    completeBiddingWithZero(4);

    fireEvent.click(screen.getByRole('button', { name: /Tom/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tom/ }));

    expect(screen.getByRole('heading', { name: /wins by \d+$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quit Game' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next Round' })).toBeInTheDocument();
  });

  it('renames the bidding back button to Undo', () => {
    render(<App />);

    fillRequiredNames();
    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }));

    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('allows undoing into bidding and undoing recorded tricks during play', () => {
    render(<App />);

    startPlayingRound();

    const undoButton = screen.getByRole('button', { name: 'Undo' });
    expect(screen.getByRole('heading', { name: '7 hands to go: Jane to lead' })).toBeInTheDocument();
    expect(undoButton).not.toBeDisabled();

    fireEvent.click(undoButton);
    expect(screen.getByRole('heading', { name: 'Tom to deal 7 cards for Clubs' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bid 0' }));
    expect(screen.getByRole('heading', { name: '7 hands to go: Jane to lead' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Tom/ }));
    expect(screen.getByRole('heading', { name: '6 hands to go: Tom to lead' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('heading', { name: '7 hands to go: Jane to lead' })).toBeInTheDocument();
  });

  it('toggles the current leaderboard on the playing screen', () => {
    render(<App />);

    startPlayingRound();

    expect(screen.queryByText('Current Leaderboard')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show Leaderboard' }));
    expect(screen.getByText('Current Leaderboard')).toBeInTheDocument();
    expect(screen.getAllByText('1=')).toHaveLength(4);

    fireEvent.click(screen.getByRole('button', { name: 'Hide Leaderboard' }));
    expect(screen.queryByText('Current Leaderboard')).not.toBeInTheDocument();
  });

  it('shows cumulative leaderboard totals during mid-game play', () => {
    render(<App />);

    fillRequiredNames();
    fireEvent.change(screen.getByRole('combobox', { name: 'Starting hand' }), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }));
    completeBiddingWithZero(4);
    fireEvent.click(screen.getByRole('button', { name: /Tom/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tom/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Next Round' }));
    completeBiddingWithZero(4);
    fireEvent.click(screen.getByRole('button', { name: 'Show Leaderboard' }));

    const leaderboardTable = screen.getByRole('table');
    const dataRows = within(leaderboardTable).getAllByRole('row').slice(1);
    const tomRow = dataRows.find((row) => within(row).queryByText('Tom'));
    expect(tomRow).toBeDefined();
    if (!tomRow) {
      throw new Error('Expected to find Tom in the leaderboard.');
    }

    const tomCells = within(tomRow).getAllByRole('cell');
    expect(tomCells[tomCells.length - 1]).toHaveTextContent('2');
  });

  it('sorts current round summary by score descending', () => {
    render(<App />);

    fillRequiredNames();
    fireEvent.change(screen.getByRole('combobox', { name: 'Starting hand' }), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }));
    completeBiddingWithZero(4);
    fireEvent.click(screen.getByRole('button', { name: /Jane/ }));
    fireEvent.click(screen.getByRole('button', { name: /Jane/ }));

    const currentRoundHeading = screen.getByText('Current Round');
    const currentRoundTable = currentRoundHeading.nextElementSibling as HTMLElement;
    const summaryRows = within(currentRoundTable).getAllByRole('row').slice(1);
    const parsedRows = summaryRows.map((row) => {
      const cells = within(row).getAllByRole('cell');
      return {
        tricks: Number(cells[2].textContent ?? '0'),
        score: Number(cells[3].textContent ?? '0'),
      };
    });

    for (let index = 1; index < parsedRows.length; index += 1) {
      const previous = parsedRows[index - 1];
      const current = parsedRows[index];
      expect(previous.score > current.score || (previous.score === current.score && previous.tricks >= current.tricks)).toBe(
        true,
      );
    }
  });
});
