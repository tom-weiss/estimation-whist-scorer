import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the configuration screen by default', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Estimation Whist Scorer: Game Setup' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Game' })).toBeInTheDocument();
  });
});
