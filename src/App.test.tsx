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

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders the configuration screen by default', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Estimation Whist Scorer.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Game' })).toBeInTheDocument();
  });

  it('allows quitting the game during play and jumps to final summary', () => {
    render(<App />);

    fillRequiredNames();

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }));
    expect(screen.getByRole('button', { name: 'Quit Game' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Playing' })).toBeDisabled();
    completeBiddingWithZero(4);
    fireEvent.click(screen.getByRole('button', { name: 'Start Playing' }));

    const quitButton = screen.getByRole('button', { name: 'Quit Game' });
    expect(quitButton).toBeInTheDocument();
    fireEvent.click(quitButton);

    expect(screen.getByRole('heading', { name: /wins by \d+\.$/ })).toBeInTheDocument();
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

    expect(screen.getByRole('heading', { name: /wins by \d+\.$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quit Game' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next Round' })).toBeInTheDocument();
  });
});
