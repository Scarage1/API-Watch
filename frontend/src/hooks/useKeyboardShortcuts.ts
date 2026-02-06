import { useEffect } from 'react';
import { useRequestStore } from '../store/useRequestStore';
import { useCommandPaletteStore } from '../store/useCommandPaletteStore';

/**
 * Global keyboard shortcut handler.
 *
 * Shortcuts (⌘ = Cmd on Mac, Ctrl on other OS):
 *  ⌘+K          → Command palette
 *  ⌘+T          → New request tab
 *  ⌘+W          → Close active tab
 *  ⌘+Shift+D    → Duplicate active tab
 *  Esc           → Close command palette
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;

      // ⌘+K → Command Palette
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useCommandPaletteStore.getState().toggle();
        return;
      }

      // ⌘+T → New Tab
      if (mod && e.key.toLowerCase() === 't') {
        e.preventDefault();
        useRequestStore.getState().addTab();
        return;
      }

      // ⌘+W → Close Tab
      if (mod && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        const { activeTabId, removeTab } = useRequestStore.getState();
        removeTab(activeTabId);
        return;
      }

      // ⌘+Shift+D → Duplicate Tab
      if (mod && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const { activeTabId, duplicateTab } = useRequestStore.getState();
        duplicateTab(activeTabId);
        return;
      }

      // Escape → Close modals / command palette
      if (e.key === 'Escape') {
        const cp = useCommandPaletteStore.getState();
        if (cp.isOpen) {
          cp.close();
        }
        return;
      }
    }

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
}
