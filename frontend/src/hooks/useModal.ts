/**
 * useModal — lightweight modal state manager.
 *
 * Usage:
 *   const { isOpen, open, close, toggle } = useModal();
 *   // With initial data:
 *   const { isOpen, data, open, close } = useModal<User>();
 *   open(selectedUser);
 */
import { useState, useCallback } from 'react';

interface UseModalResult<T = undefined> {
  isOpen: boolean;
  data: T | null;
  open: (data?: T) => void;
  close: () => void;
  toggle: () => void;
}

export function useModal<T = undefined>(): UseModalResult<T> {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<T | null>(null);

  const open = useCallback((payload?: T) => {
    if (payload !== undefined) setData(payload as T);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    // Small delay before clearing data so close animation can finish
    setTimeout(() => setData(null), 200);
  }, []);

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  return { isOpen, data, open, close, toggle };
}

export default useModal;
