import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { MockWalletRepository } from '../src/api/mock';
import type { TransactionPreview } from '../src/api/types';
import type { RootStackParamList } from '../src/navigation/types';
import { ReviewTransactionScreen } from '../src/screens/ReviewTransactionScreen';
import { TransactionDetailScreen } from '../src/screens/TransactionDetailScreen';
import { AppSettingsProvider } from '../src/state/AppSettings';
import { renderedText } from '../test-utils/text';

jest.useFakeTimers();

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const Stack = createNativeStackNavigator<RootStackParamList>();

function byTestId(
  renderer: ReactTestRenderer,
  testID: string,
): ReactTestInstance {
  return renderer.root.find(
    node =>
      node.props.testID === testID &&
      (typeof node.props.onPress === 'function' ||
        typeof node.props.onChangeText === 'function'),
  );
}

function queryByTestId(renderer: ReactTestRenderer, testID: string) {
  return renderer.root.findAll(node => node.props.testID === testID);
}

async function flush() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
  }
}

/** Resolves a mock-repository promise whose latency uses (fake) timers. */
async function withTimers<T>(promise: Promise<T>): Promise<T> {
  jest.runOnlyPendingTimers();
  return promise;
}

async function renderReview(
  repository: MockWalletRepository,
  preview: TransactionPreview,
) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={new QueryClient()}>
        <AppSettingsProvider initialRepository={repository}>
          <NavigationContainer>
            <Stack.Navigator>
              <Stack.Screen
                name="ReviewTransaction"
                component={ReviewTransactionScreen}
                initialParams={{ preview }}
              />
              <Stack.Screen
                name="TransactionDetail"
                component={TransactionDetailScreen}
              />
            </Stack.Navigator>
          </NavigationContainer>
        </AppSettingsProvider>
      </QueryClientProvider>,
    );
  });
  await flush();
  return renderer;
}

beforeEach(async () => {
  await AsyncStorage.setItem('ufunguo:pref:selectedWallet', 'presentation');
});

afterEach(async () => {
  await AsyncStorage.clear();
});

test('review shows the transaction anatomy before anything is signed', async () => {
  const repository = new MockWalletRepository(0);
  const preview = await withTimers(
    repository.previewTransaction('presentation', {
      address: 'bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080',
      amountSats: 25_000,
    }),
  );
  const send = jest.spyOn(repository, 'sendTransaction');

  const renderer = await renderReview(repository, preview);
  const text = renderedText(renderer);

  expect(text).toContain('Selected UTXO');
  expect(text).toContain('Recipient');
  expect(text).toContain('Change (back to you)');
  expect(text).toContain('Miner fee');
  expect(text).toContain('PSBT (unsigned)');
  expect(text).toContain('Local signature');
  expect(text).toContain('Bitcoin network');
  expect(text).toContain('Absolute fee');
  expect(text).toContain('1 in · 2 out');
  // No phrase field until the user explicitly confirms the review.
  expect(queryByTestId(renderer, 'review-word-1')).toHaveLength(0);
  expect(send).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

test('signing requires explicit confirmation and clears the phrase', async () => {
  const repository = new MockWalletRepository(0);
  const preview = await withTimers(
    repository.previewTransaction('presentation', {
      address: 'bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080',
      amountSats: 25_000,
    }),
  );
  const send = jest.spyOn(repository, 'sendTransaction');
  const renderer = await renderReview(repository, preview);

  await act(async () => byTestId(renderer, 'review-confirm').props.onPress());
  const first = byTestId(renderer, 'review-word-1');
  expect(first.props.secureTextEntry).toBe(true);

  // Pasting the whole phrase into one box fills all twelve.
  await act(async () => first.props.onChangeText(PHRASE));
  expect(byTestId(renderer, 'review-word-12').props.value).toBe('about');
  // Fire without awaiting: the mock's latency resolves when flush() runs timers.
  await act(async () => {
    byTestId(renderer, 'review-sign').props.onPress();
  });
  await flush();

  expect(send).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith('presentation', preview.previewId, PHRASE);
  // Navigated to the transaction, with no trace of the phrase on screen.
  const text = renderedText(renderer);
  expect(text).toContain('What just happened?');
  expect(text).toContain('Confirmation timeline');
  expect(text).not.toContain('abandon');
  expect(queryByTestId(renderer, 'review-word-1')).toHaveLength(0);
  await act(async () => renderer.unmount());
});
