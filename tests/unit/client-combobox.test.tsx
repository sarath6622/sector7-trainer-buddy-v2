import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClientCombobox } from '@/components/forms/ClientCombobox';

const OPTIONS = [
  { value: 'cp-1', label: 'Test Hazeena B' },
  { value: 'cp-2', label: 'Test Sarath Kumar' },
  { value: 'cp-3', label: 'Aiswarya Nair' },
];

function setup(props: Partial<React.ComponentProps<typeof ClientCombobox>> = {}) {
  const onChange = vi.fn();
  render(<ClientCombobox options={OPTIONS} value="" onChange={onChange} {...props} />);
  return { onChange };
}

describe('ClientCombobox', () => {
  it('shows the placeholder until a client is selected', () => {
    setup();
    expect(screen.getByRole('button', { name: /select client/i })).toBeTruthy();
  });

  it('shows the selected client label on the trigger', () => {
    setup({ value: 'cp-2' });
    expect(screen.getByRole('button', { name: /Test Sarath Kumar/ })).toBeTruthy();
  });

  it('opens the list and filters in memory by search text', () => {
    setup();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getAllByRole('option')).toHaveLength(3);

    fireEvent.change(screen.getByPlaceholderText('Search clients...'), {
      target: { value: 'sarath' },
    });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]?.textContent).toContain('Test Sarath Kumar');
  });

  it('reports the empty state when nothing matches', () => {
    setup();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByPlaceholderText('Search clients...'), {
      target: { value: 'zzz' },
    });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('No clients')).toBeTruthy();
  });

  it('emits the option value and closes on pick', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('option', { name: /Aiswarya Nair/ }));
    expect(onChange).toHaveBeenCalledWith('cp-3');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('marks the current value as the selected option', () => {
    setup({ value: 'cp-1' });
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('option', { name: /Test Hazeena B/ }).getAttribute('aria-selected')).toBe(
      'true'
    );
  });

  it('renders initials when showInitials is set', () => {
    setup({ value: 'cp-1', showInitials: true });
    expect(screen.getByRole('button', { name: /TB/ })).toBeTruthy();
  });

  it('closes on Escape from the search field', () => {
    setup();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.keyDown(screen.getByPlaceholderText('Search clients...'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
