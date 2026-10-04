import AsyncStorage from '@react-native-async-storage/async-storage';

// Only non-secret preferences are persisted. Recovery phrases, PSBTs and
// signing results must never be written here.
const PREFIX = 'ufunguo:pref:';

export type PreferenceKey = 'selectedWallet' | 'explainMode' | 'dataSource';

export async function readPreference(
  key: PreferenceKey,
): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export async function writePreference(
  key: PreferenceKey,
  value: string | null,
): Promise<void> {
  try {
    if (value === null) {
      await AsyncStorage.removeItem(PREFIX + key);
    } else {
      await AsyncStorage.setItem(PREFIX + key, value);
    }
  } catch {
    // Preferences are a convenience; failing to save them is not fatal.
  }
}
