import { useEffect } from 'react';
import { Linking } from 'react-native';
import { useAppSettings } from '../state/AppSettings';
import { parseDevSelectLink } from './linking';

/**
 * In development builds, `ufunguo://dev/select/<wallet>` selects a wallet so
 * demos and screenshots can be scripted with `simctl openurl`. Renders nothing
 * and is not mounted in release builds.
 */
export function DevLinkHandler() {
  const { selectWallet } = useAppSettings();

  useEffect(() => {
    const handle = (url: string | null | undefined) => {
      const wallet = url ? parseDevSelectLink(url) : null;
      if (wallet) {
        selectWallet(wallet);
      }
    };
    Linking.getInitialURL().then(handle);
    const subscription = Linking.addEventListener('url', event =>
      handle(event.url),
    );
    return () => subscription.remove();
  }, [selectWallet]);

  return null;
}
