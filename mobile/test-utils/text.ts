import { Text } from 'react-native';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

function collect(node: ReactTestInstance | string): string {
  if (typeof node === 'string') {
    return node;
  }
  return node.children.map(collect).join('');
}

/** All rendered text, one Text element per line. */
export function renderedText(renderer: ReactTestRenderer): string {
  return renderer.root.findAllByType(Text).map(collect).join('\n');
}
