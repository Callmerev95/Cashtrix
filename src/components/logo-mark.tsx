/**
 * Brand mark — owner-supplied artwork (`assets/logo-mark.png`, derived from
 * `assets/brand-source.png` via `scripts/build-brand-assets.py`).
 *
 * Previously a code-drawn "C" disc (no `react-native-svg` in the project, T6
 * reasoning); now the real mark as a static image — Metro bundles `require()`
 * assets, so this stays OTA-safe with no native module. One component, so
 * the auth screens and sheets never drift apart.
 */
import { Image } from 'react-native';

export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/logo-mark.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessible={false}
    />
  );
}
