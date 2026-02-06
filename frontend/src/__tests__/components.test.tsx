import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';

function renderWithRouter(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe('Header', () => {
  it('renders brand name', () => {
    renderWithRouter(<Header />);
    expect(screen.getByText('API')).toBeInTheDocument();
    expect(screen.getByText('Watch')).toBeInTheDocument();
  });

  it('renders toggle sidebar button', () => {
    renderWithRouter(<Header />);
    expect(screen.getByLabelText('Toggle sidebar')).toBeInTheDocument();
  });

  it('renders dark mode toggle', () => {
    renderWithRouter(<Header />);
    expect(screen.getByLabelText('Toggle dark mode')).toBeInTheDocument();
  });

  it('shows connected status', () => {
    renderWithRouter(<Header />);
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });
});

describe('Sidebar', () => {
  it('renders all navigation items', () => {
    renderWithRouter(<Sidebar />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Request')).toBeInTheDocument();
    expect(screen.getByText('Test Suites')).toBeInTheDocument();
    expect(screen.getByText('Analytics')).toBeInTheDocument();
    expect(screen.getByText('History')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders section headers', () => {
    renderWithRouter(<Sidebar />);
    expect(screen.getByText('Build')).toBeInTheDocument();
    expect(screen.getByText('Insights')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
  });

  it('renders version footer', () => {
    renderWithRouter(<Sidebar />);
    expect(screen.getByText('API-Watch v2.0')).toBeInTheDocument();
  });
});
