import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { useToastStore, toast } from '../store/useToastStore';
import { useCommandPaletteStore } from '../store/useCommandPaletteStore';
import ToastContainer from '../components/ToastContainer';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import { Skeleton, CardSkeleton, TableRowSkeleton } from '../components/Skeleton';
import OnboardingModal from '../components/OnboardingModal';
import CommandPalette from '../components/CommandPalette';

// ── Helpers ──────────────────────────────────────────────────────────────────

function wrap(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

// ── Toast Store ──────────────────────────────────────────────────────────────

describe('useToastStore', () => {
  beforeEach(() => {
    useToastStore.getState().clearAll();
  });

  it('adds a toast', () => {
    toast.success('Hello');
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe('success');
    expect(toasts[0].title).toBe('Hello');
  });

  it('adds multiple toast types', () => {
    toast.success('S');
    toast.error('E');
    toast.info('I');
    toast.warning('W');
    expect(useToastStore.getState().toasts).toHaveLength(4);
  });

  it('removes a toast by id', () => {
    toast.info('Test');
    const id = useToastStore.getState().toasts[0].id;
    useToastStore.getState().removeToast(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('clears all toasts', () => {
    toast.success('A');
    toast.error('B');
    useToastStore.getState().clearAll();
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('error toast has longer duration', () => {
    toast.error('Fail');
    expect(useToastStore.getState().toasts[0].duration).toBe(6000);
  });

  it('warning toast has medium duration', () => {
    toast.warning('Warn');
    expect(useToastStore.getState().toasts[0].duration).toBe(5000);
  });
});

// ── Toast Container ──────────────────────────────────────────────────────────

describe('ToastContainer', () => {
  beforeEach(() => {
    useToastStore.getState().clearAll();
  });

  it('renders nothing when no toasts', () => {
    const { container } = render(<ToastContainer />);
    expect(container.firstChild).toBeNull();
  });

  it('renders toast content', () => {
    toast.success('Done!', 'Task completed');
    render(<ToastContainer />);
    expect(screen.getByText('Done!')).toBeInTheDocument();
    expect(screen.getByText('Task completed')).toBeInTheDocument();
  });

  it('limits to 5 visible toasts', () => {
    for (let i = 0; i < 8; i++) toast.info(`Toast ${i}`);
    render(<ToastContainer />);
    // Should only show last 5
    expect(screen.queryByText('Toast 0')).not.toBeInTheDocument();
    expect(screen.getByText('Toast 7')).toBeInTheDocument();
  });
});

// ── Confirm Dialog ───────────────────────────────────────────────────────────

describe('ConfirmDialog', () => {
  it('renders when open', () => {
    render(
      <ConfirmDialog
        open={true}
        title="Delete item?"
        description="This cannot be undone."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('Delete item?')).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <ConfirmDialog
        open={false}
        title="Delete?"
        description="Gone."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.queryByText('Delete?')).not.toBeInTheDocument();
  });

  it('calls onConfirm when confirm clicked', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="Confirm?"
        description="Sure?"
        confirmLabel="Yes"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Yes'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onCancel when cancel clicked', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="Confirm?"
        description="Sure?"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('calls onCancel on Escape key', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="Confirm?"
        description="Sure?"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('has proper ARIA attributes', () => {
    render(
      <ConfirmDialog
        open={true}
        title="Delete?"
        description="All data will be lost."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'confirm-title');
    expect(dialog).toHaveAttribute('aria-describedby', 'confirm-desc');
  });
});

// ── Loading Spinner ──────────────────────────────────────────────────────────

describe('LoadingSpinner', () => {
  it('renders with status role', () => {
    render(<LoadingSpinner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });
});

// ── Skeleton ─────────────────────────────────────────────────────────────────

describe('Skeleton', () => {
  it('renders single line', () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(1);
  });

  it('renders multiple lines', () => {
    const { container } = render(<Skeleton lines={3} />);
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(3);
  });

  it('has sr-only loading text', () => {
    render(<Skeleton />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });
});

describe('CardSkeleton', () => {
  it('renders with status role', () => {
    render(<CardSkeleton />);
    const statuses = screen.getAllByRole('status');
    expect(statuses.length).toBeGreaterThan(0);
  });
});

describe('TableRowSkeleton', () => {
  it('renders specified number of columns', () => {
    const { container } = render(
      <table><tbody><TableRowSkeleton cols={4} /></tbody></table>
    );
    expect(container.querySelectorAll('td')).toHaveLength(4);
  });
});

// ── Command Palette Store ────────────────────────────────────────────────────

describe('useCommandPaletteStore', () => {
  beforeEach(() => {
    useCommandPaletteStore.getState().close();
  });

  it('starts closed', () => {
    expect(useCommandPaletteStore.getState().isOpen).toBe(false);
  });

  it('opens', () => {
    useCommandPaletteStore.getState().open();
    expect(useCommandPaletteStore.getState().isOpen).toBe(true);
  });

  it('closes', () => {
    useCommandPaletteStore.getState().open();
    useCommandPaletteStore.getState().close();
    expect(useCommandPaletteStore.getState().isOpen).toBe(false);
  });

  it('toggles', () => {
    useCommandPaletteStore.getState().toggle();
    expect(useCommandPaletteStore.getState().isOpen).toBe(true);
    useCommandPaletteStore.getState().toggle();
    expect(useCommandPaletteStore.getState().isOpen).toBe(false);
  });
});

// ── Command Palette Component ────────────────────────────────────────────────

describe('CommandPalette', () => {
  beforeEach(() => {
    useCommandPaletteStore.getState().close();
  });

  it('does not render when closed', () => {
    wrap(<CommandPalette />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders when open', () => {
    useCommandPaletteStore.getState().open();
    wrap(<CommandPalette />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type a command…')).toBeInTheDocument();
  });

  it('shows navigation commands', () => {
    useCommandPaletteStore.getState().open();
    wrap(<CommandPalette />);
    expect(screen.getByText('Go to Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Go to Settings')).toBeInTheDocument();
  });

  it('filters commands by query', () => {
    useCommandPaletteStore.getState().open();
    wrap(<CommandPalette />);
    const input = screen.getByPlaceholderText('Type a command…');
    fireEvent.change(input, { target: { value: 'dashboard' } });
    expect(screen.getByText('Go to Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Go to Settings')).not.toBeInTheDocument();
  });

  it('shows no results for impossible query', () => {
    useCommandPaletteStore.getState().open();
    wrap(<CommandPalette />);
    const input = screen.getByPlaceholderText('Type a command…');
    fireEvent.change(input, { target: { value: 'zzzzzzzzz' } });
    expect(screen.getByText('No results found')).toBeInTheDocument();
  });

  it('has proper ARIA attributes', () => {
    useCommandPaletteStore.getState().open();
    wrap(<CommandPalette />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Command palette');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('supports keyboard navigation', () => {
    useCommandPaletteStore.getState().open();
    wrap(<CommandPalette />);
    const input = screen.getByPlaceholderText('Type a command…');
    // Arrow down should move selection
    fireEvent.keyDown(input.closest('div')!, { key: 'ArrowDown' });
    // The second option should now be selected
    const options = screen.getAllByRole('option');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
  });
});

// ── Onboarding Modal ─────────────────────────────────────────────────────────

describe('OnboardingModal', () => {
  beforeEach(() => {
    localStorage.removeItem('api-watch-onboarding-seen');
  });

  afterEach(() => {
    localStorage.removeItem('api-watch-onboarding-seen');
  });

  it('does not render if already seen', () => {
    localStorage.setItem('api-watch-onboarding-seen', 'true');
    render(<OnboardingModal />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows after delay for new users', async () => {
    vi.useFakeTimers();
    render(<OnboardingModal />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(700); });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/welcome to api/i)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('advances steps on Next click', async () => {
    vi.useFakeTimers();
    render(<OnboardingModal />);
    act(() => { vi.advanceTimersByTime(700); });
    expect(screen.getByText('Send Requests')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Organize Collections')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('dismisses on Skip', () => {
    vi.useFakeTimers();
    render(<OnboardingModal />);
    act(() => { vi.advanceTimersByTime(700); });
    fireEvent.click(screen.getByText('Skip'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem('api-watch-onboarding-seen')).toBe('true');
    vi.useRealTimers();
  });

  it('dismisses on Get Started (last step)', () => {
    vi.useFakeTimers();
    render(<OnboardingModal />);
    act(() => { vi.advanceTimersByTime(700); });
    // Navigate to last step
    fireEvent.click(screen.getByText('Next')); // step 2
    fireEvent.click(screen.getByText('Next')); // step 3
    fireEvent.click(screen.getByText('Next')); // step 4
    fireEvent.click(screen.getByText('Get Started'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});

// ── Keyboard Shortcuts (via store) ───────────────────────────────────────────

describe('Keyboard Shortcuts Integration', () => {
  it('⌘+K toggles command palette', () => {
    // The hook fires from App, but we can test the store directly
    useCommandPaletteStore.getState().close();
    useCommandPaletteStore.getState().toggle();
    expect(useCommandPaletteStore.getState().isOpen).toBe(true);
    useCommandPaletteStore.getState().toggle();
    expect(useCommandPaletteStore.getState().isOpen).toBe(false);
  });
});

// ── Accessibility Checks ─────────────────────────────────────────────────────

describe('Accessibility', () => {
  it('LoadingSpinner has aria-label', () => {
    render(<LoadingSpinner />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading');
  });

  it('Skeleton has sr-only text', () => {
    render(<Skeleton />);
    const srOnly = screen.getByText('Loading…');
    expect(srOnly.classList.contains('sr-only')).toBe(true);
  });

  it('ConfirmDialog has proper dialog role', () => {
    render(
      <ConfirmDialog
        open={true}
        title="Test"
        description="Desc"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
