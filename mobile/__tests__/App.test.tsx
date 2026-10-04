import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import App from '../App';
import { MockWalletRepository } from '../src/api/mock';

jest.useFakeTimers();

function textContent(renderer: ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

test('shows onboarding when no wallet is selected', async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<App repository={new MockWalletRepository(0)} />);
  });
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
  const text = textContent(renderer);
  expect(text).toContain('Ufunguo');
  expect(text).toContain('Create a new wallet');
  expect(text).toContain('Restore from recovery phrase');
  expect(text).toContain('Regtest');
  await act(async () => renderer.unmount());
});
