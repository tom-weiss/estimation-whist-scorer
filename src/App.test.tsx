import { fireEvent, render, screen } from '@testing-library/react';
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
  fireEvent.click(screen.getByRole('button', { name: 'Start Playing' }));
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
    expect(screen.getByRole('heading', { name: 'Tom to deal 7 cards' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quit Game' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Playing' })).toBeDisabled();
    completeBiddingWithZero(4);
    fireEvent.click(screen.getByRole('button', { name: 'Start Playing' }));

    const quitButton = screen.getByRole('button', { name: 'Quit Game' });
    expect(quitButton).toBeInTheDocument();
    fireEvent.click(quitButton);

    expect(screen.getByRole('heading', { name: /wins by \d+$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Game' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next Round' })).not.toBeInTheDocument();
  });

  it('shows Quit Game on non-final summary next round screen', () => {
    render(<App />);

    fillRequiredNames();
    fireEvent.change(screen.getByRole('combobox', { name: 'Starting hand' }), { target: { value: '2' } });

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }));
    completeBiddingWithZero(4);
    fireEvent.click(screen.getByRole('button', { name: 'Start Playing' }));

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

  it('allows undoing a recorded trick during play', () => {
    render(<App />);

    startPlayingRound();

    const undoButton = screen.getByRole('button', { name: 'Undo' });
    expect(screen.getByRole('heading', { name: 'Jane to lead' })).toBeInTheDocument();
    expect(undoButton).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Tom/ }));
    expect(screen.getByRole('heading', { name: 'Tom to lead' })).toBeInTheDocument();
    expect(undoButton).not.toBeDisabled();

    fireEvent.click(undoButton);
    expect(screen.getByRole('heading', { name: 'Jane to lead' })).toBeInTheDocument();
    expect(undoButton).toBeDisabled();
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
});
