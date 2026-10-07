import { describe, it, expect } from 'vitest';
import { useState, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Modal from '../Modal';

function Opener({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="A dialog">
        {children}
        <button type="button" onClick={() => setOpen(false)}>
          Done
        </button>
      </Modal>
    </>
  );
}

function open() {
  const opener = screen.getByRole('button', { name: 'Open' });
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

describe('Modal', () => {
  it('puts focus on the first field, not the close button', async () => {
    render(
      <Opener>
        <label htmlFor="name">Name</label>
        <input id="name" />
      </Opener>,
    );
    open();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Name')));
  });

  it('puts focus on the primary action when there is no field', async () => {
    render(
      <Opener>
        <button type="button">Keep going</button>
        <button type="button" className="btn-primary">
          Adjourn
        </button>
      </Opener>,
    );
    open();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Adjourn' })),
    );
  });

  it('returns focus to what opened it when it closes', async () => {
    render(
      <Opener>
        <input aria-label="Name" />
      </Opener>,
    );
    const opener = open();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Name')));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('returns focus after Escape too', async () => {
    render(
      <Opener>
        <input aria-label="Name" />
      </Opener>,
    );
    const opener = open();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Name')));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(opener);
  });
});
