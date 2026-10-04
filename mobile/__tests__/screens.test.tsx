import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import App from '../App';
import { renderedText } from '../test-utils/text';
import { MockWalletRepository } from '../src/api/mock';

jest.useFakeTimers();

async function renderApp() {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<App repository={new MockWalletRepository(0)} />);
  });
  // Let preferences load and queries resolve.
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
  }
  return renderer;
}

afterEach(async () => {
  await AsyncStorage.clear();
});

test('home shows balances and wallet knowledge for the selected wallet', async () => {
  await AsyncStorage.setItem('ufunguo:pref:selectedWallet', 'presentation');
  const renderer = await renderApp();
  const text = renderedText(renderer);

  expect(text).toContain('presentation');
  expect(text).toContain('Regtest');
  expect(text).toContain('74,999,718');
  expect(text).toContain('Confirmed');
  expect(text).toContain('Unconfirmed');
  expect(text).toContain('Synced to block 214');
  expect(text).toContain('What your wallet knows');
  expect(text).toContain('Spendable UTXOs');
  await act(async () => renderer.unmount());
});

test('selected but missing wallet shows a helpful error state', async () => {
  await AsyncStorage.setItem('ufunguo:pref:selectedWallet', 'ghost');
  const renderer = await renderApp();
  const text = renderedText(renderer);

  expect(text).toContain('Wallet not found');
  await act(async () => renderer.unmount());
});
