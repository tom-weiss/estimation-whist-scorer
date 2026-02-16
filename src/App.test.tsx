import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the configuration screen by default', () => {
    render(<App />);
    expect(screen.getByText('Estimation Whist Scorer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Game' })).toBeInTheDocument();
  });
});
