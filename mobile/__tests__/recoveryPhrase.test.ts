import {
  applyPhraseInput,
  emptyPhrase,
  filledWordCount,
  isBip39Word,
  phraseToString,
  suggestWords,
} from '../src/components/RecoveryPhraseInput';
import { BIP39_ENGLISH } from '../src/content/bip39English';

const PHRASE =
  'legal winner thank year wave sausage worth useful legal winner thank yellow';

test('uses the full, sorted BIP39 English list', () => {
  expect(BIP39_ENGLISH).toHaveLength(2048);
  expect(BIP39_ENGLISH[0]).toBe('abandon');
  expect(BIP39_ENGLISH[2047]).toBe('zoo');
  expect([...BIP39_ENGLISH].sort()).toEqual(BIP39_ENGLISH);
});

test('checks word-list membership case-insensitively', () => {
  expect(isBip39Word('Legal ')).toBe(true);
  expect(isBip39Word('bitcoin')).toBe(false);
  expect(isBip39Word('')).toBe(false);
});

test('suggests words by prefix', () => {
  expect(suggestWords('zo')).toEqual(['zone', 'zoo']);
  expect(suggestWords('ab')).toHaveLength(4);
  expect(suggestWords('')).toEqual([]);
  expect(suggestWords('xyz')).toEqual([]);
});

test('typing a word followed by a space moves to the next box', () => {
  const result = applyPhraseInput(emptyPhrase(), 0, 'Legal ');
  expect(result.words[0]).toBe('legal');
  expect(result.focus).toBe(1);
});

test('typing without a space stays in the box', () => {
  const result = applyPhraseInput(emptyPhrase(), 3, 'yea');
  expect(result.words[3]).toBe('yea');
  expect(result.focus).toBeNull();
});

test('pasting a full phrase into any box fills all twelve from the start', () => {
  const result = applyPhraseInput(emptyPhrase(), 5, `  ${PHRASE}\n`);
  expect(phraseToString(result.words)).toBe(PHRASE);
  expect(filledWordCount(result.words)).toBe(12);
  expect(result.focus).toBe(11);
});

test('pasting a few words fills consecutive boxes from the current one', () => {
  const result = applyPhraseInput(emptyPhrase(), 10, 'thank yellow extra');
  expect(result.words.slice(10)).toEqual(['thank', 'yellow']);
  expect(filledWordCount(result.words)).toBe(2);
});

test('joins boxes into a normalized phrase', () => {
  const words = emptyPhrase();
  words[0] = ' Legal';
  words[1] = 'WINNER ';
  expect(phraseToString(words)).toBe('legal winner');
});
