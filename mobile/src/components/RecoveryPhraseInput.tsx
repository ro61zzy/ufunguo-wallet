import React, { useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { BIP39_ENGLISH } from '../content/bip39English';
import { colors, fonts, radii, spacing } from '../theme/tokens';
import { AppText } from './AppText';

export const PHRASE_LENGTH = 12;
const MAX_SUGGESTIONS = 4;
const WORDS = new Set(BIP39_ENGLISH);

export function emptyPhrase(): string[] {
  return Array<string>(PHRASE_LENGTH).fill('');
}

/** Joins the boxes into the single string the Rust API expects. */
export function phraseToString(words: readonly string[]): string {
  return words
    .map(word => word.trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
}

export function filledWordCount(words: readonly string[]): number {
  return words.filter(word => word.trim() !== '').length;
}

/** Word-list membership only. Rust still checks the BIP39 checksum. */
export function isBip39Word(word: string): boolean {
  return WORDS.has(word.trim().toLowerCase());
}

export function suggestWords(
  prefix: string,
  limit = MAX_SUGGESTIONS,
): string[] {
  const needle = prefix.trim().toLowerCase();
  if (needle === '') {
    return [];
  }
  const matches: string[] = [];
  for (const word of BIP39_ENGLISH) {
    if (word.startsWith(needle)) {
      matches.push(word);
      if (matches.length === limit) {
        break;
      }
    }
  }
  return matches;
}

/**
 * Places typed or pasted text into the boxes. Text containing several words
 * (a pasted phrase) is spread across consecutive boxes; a full phrase always
 * starts at box 1. Returns the new words and the box that should get focus.
 */
export function applyPhraseInput(
  words: readonly string[],
  index: number,
  text: string,
): { words: string[]; focus: number | null } {
  const next = [...words];
  const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
  const endsWithSpace = /\s$/.test(text);

  if (tokens.length <= 1) {
    next[index] = tokens[0] ?? '';
    const advance = endsWithSpace && tokens.length === 1;
    return {
      words: next,
      focus: advance ? Math.min(index + 1, PHRASE_LENGTH - 1) : null,
    };
  }

  const start = tokens.length >= PHRASE_LENGTH ? 0 : index;
  tokens.slice(0, PHRASE_LENGTH - start).forEach((token, offset) => {
    next[start + offset] = token;
  });
  const lastFilled = Math.min(start + tokens.length, PHRASE_LENGTH) - 1;
  return { words: next, focus: Math.min(lastFilled + 1, PHRASE_LENGTH - 1) };
}

interface RecoveryPhraseInputProps {
  value: string[];
  onChange: (words: string[]) => void;
  /** Start with the words masked (e.g. when signing). */
  hiddenByDefault?: boolean;
  /** Status text shown while no word is invalid. Defaults to a word count. */
  hint?: string;
  testIDPrefix?: string;
}

/**
 * Twelve numbered word boxes, like the paper backup. Words are checked
 * against the BIP39 list as you type, suggestions complete a word, pasting
 * a whole phrase fills every box, and Space/Return moves to the next box.
 * Keyboard learning, autocorrect and autofill are disabled.
 */
export function RecoveryPhraseInput({
  value,
  onChange,
  hiddenByDefault = false,
  hint,
  testIDPrefix = 'phrase-word',
}: RecoveryPhraseInputProps) {
  const [hidden, setHidden] = useState(hiddenByDefault);
  const [focused, setFocused] = useState<number | null>(null);
  const inputs = useRef<Array<React.ComponentRef<typeof TextInput> | null>>([]);

  const focusBox = (index: number | null) => {
    if (index !== null) {
      inputs.current[index]?.focus();
    }
  };

  const handleChange = (index: number, text: string) => {
    const result = applyPhraseInput(value, index, text);
    onChange(result.words);
    focusBox(result.focus);
  };

  const choose = (word: string) => {
    if (focused === null) {
      return;
    }
    const next = [...value];
    next[focused] = word;
    onChange(next);
    if (focused < PHRASE_LENGTH - 1) {
      focusBox(focused + 1);
    } else {
      inputs.current[focused]?.blur();
    }
  };

  const current = focused !== null ? value[focused] : '';
  const suggestions = useMemo(
    () =>
      focused !== null && !isBip39Word(current) ? suggestWords(current) : [],
    [current, focused],
  );
  const invalidCount = value.filter(
    (word, index) => word !== '' && index !== focused && !isBip39Word(word),
  ).length;

  // Android's visible-password keyboard has no predictions or learning.
  const keyboardType: TextInputProps['keyboardType'] =
    Platform.OS === 'android' && !hidden ? 'visible-password' : 'default';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <AppText variant="label">Recovery phrase</AppText>
        <Pressable
          onPress={() => setHidden(value_ => !value_)}
          accessibilityRole="button"
          accessibilityLabel={hidden ? 'Show words' : 'Hide words'}
          hitSlop={8}
        >
          <AppText variant="label" style={styles.toggle}>
            {hidden ? 'Show words' : 'Hide words'}
          </AppText>
        </Pressable>
      </View>

      <View style={styles.grid}>
        {value.map((word, index) => {
          const invalid =
            word !== '' && index !== focused && !isBip39Word(word);
          return (
            <View
              key={index}
              style={[
                styles.box,
                focused === index && styles.boxFocused,
                invalid && styles.boxInvalid,
              ]}
            >
              <AppText
                variant="caption"
                color="textMuted"
                style={styles.number}
              >
                {index + 1}
              </AppText>
              <TextInput
                ref={input => {
                  inputs.current[index] = input;
                }}
                testID={`${testIDPrefix}-${index + 1}`}
                accessibilityLabel={`Word ${index + 1}`}
                accessibilityHint={
                  invalid ? 'Not in the BIP39 word list' : undefined
                }
                value={word}
                onChangeText={text => handleChange(index, text)}
                onFocus={() => setFocused(index)}
                onBlur={() =>
                  setFocused(current_ => (current_ === index ? null : current_))
                }
                onSubmitEditing={() =>
                  index < PHRASE_LENGTH - 1
                    ? focusBox(index + 1)
                    : inputs.current[index]?.blur()
                }
                returnKeyType={index < PHRASE_LENGTH - 1 ? 'next' : 'done'}
                blurOnSubmit={index === PHRASE_LENGTH - 1}
                secureTextEntry={hidden}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
                textContentType="none"
                importantForAutofill="no"
                keyboardType={keyboardType}
                contextMenuHidden={hidden}
                style={styles.input}
              />
            </View>
          );
        })}
      </View>

      {suggestions.length > 0 ? (
        <View style={styles.suggestions} accessibilityLabel="Word suggestions">
          {suggestions.map(word => (
            <Pressable
              key={word}
              onPress={() => choose(word)}
              accessibilityRole="button"
              accessibilityLabel={`Use ${word}`}
              style={({ pressed }) => [
                styles.chip,
                pressed && styles.chipPressed,
              ]}
            >
              <AppText variant="mono">{word}</AppText>
            </Pressable>
          ))}
        </View>
      ) : null}

      <AppText
        variant="caption"
        color={invalidCount > 0 ? 'danger' : 'textMuted'}
        accessibilityLiveRegion="polite"
      >
        {invalidCount > 0
          ? `${invalidCount} word${
              invalidCount === 1 ? ' is' : 's are'
            } not in the BIP39 word list.`
          : hint ??
            `${filledWordCount(
              value,
            )} of ${PHRASE_LENGTH} words. You can paste the whole phrase into any box.`}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.xs,
  },
  box: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    paddingLeft: spacing.sm,
  },
  boxFocused: { borderColor: colors.primary },
  boxInvalid: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  number: { width: 20, textAlign: 'right' },
  input: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: spacing.xs,
    fontFamily: fonts.mono,
    fontSize: 15,
    color: colors.ink,
  },
  toggle: { textDecorationLine: 'underline' },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
  },
  chipPressed: { backgroundColor: colors.primary },
});
