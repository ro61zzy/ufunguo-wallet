import { Platform, Settings } from 'react-native';

// Development-only launch arguments (iOS exposes them through NSUserDefaults):
//   xcrun simctl launch booted <bundle-id> \
//     -ufunguoDevWallet presentation -ufunguoDevURL ufunguo://lab
// They make demos and screenshots scriptable without tapping through the UI.

function read(key: string): string | null {
  if (!__DEV__ || Platform.OS !== 'ios') {
    return null;
  }
  try {
    const value: unknown = Settings.get(key);
    return typeof value === 'string' && value !== '' ? value : null;
  } catch {
    // Not available outside a native iOS runtime (e.g. Jest).
    return null;
  }
}

export function devLaunchWallet(): string | null {
  return read('ufunguoDevWallet');
}

export function devLaunchUrl(): string | null {
  const url = read('ufunguoDevURL');
  return url?.startsWith('ufunguo://') ? url : null;
}
