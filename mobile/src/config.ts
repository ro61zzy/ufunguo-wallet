import { Platform } from 'react-native';

/**
 * Local regtest-only Rust API (`cargo run -p ufunguo-api` in rust/).
 * The Android emulator reaches the host machine's loopback via 10.0.2.2.
 * Physical devices cannot reach it: the API deliberately binds to localhost.
 */
export const API_BASE_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:8787' : 'http://127.0.0.1:8787';
