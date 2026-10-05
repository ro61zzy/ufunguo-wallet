import React from 'react';
import { ActivityIndicator } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Button } from '../src/components/Button';
import { renderedText } from '../test-utils/text';

/** The Pressable rendered by Button (the first node with its role). */
function button(renderer: ReactTestRenderer) {
  return renderer.root.findAll(
    node =>
      node.props.testID === 'btn' && node.props.accessibilityRole === 'button',
  )[0];
}

async function render(element: React.ReactElement) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(element);
  });
  return renderer;
}

test('a loading button shows a spinner, its loading label and blocks presses', async () => {
  const onPress = jest.fn();
  const renderer = await render(
    <Button
      testID="btn"
      label="Sync"
      loadingLabel="Syncing…"
      loading
      onPress={onPress}
    />,
  );

  expect(renderer.root.findAllByType(ActivityIndicator)).toHaveLength(1);
  expect(renderedText(renderer)).toBe('Syncing…');
  const pressable = button(renderer);
  expect(pressable.props.disabled).toBe(true);
  expect(pressable.props.accessibilityState).toEqual({
    disabled: true,
    busy: true,
  });
});

test('an idle button shows its label and no spinner', async () => {
  const renderer = await render(
    <Button
      testID="btn"
      label="Sync"
      loadingLabel="Syncing…"
      onPress={jest.fn()}
    />,
  );

  expect(renderer.root.findAllByType(ActivityIndicator)).toHaveLength(0);
  expect(renderedText(renderer)).toBe('Sync');
  expect(button(renderer).props.disabled).toBe(false);
});
