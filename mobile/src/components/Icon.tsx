import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '../theme/tokens';

export type IconName =
  | 'home'
  | 'activity'
  | 'lab'
  | 'settings'
  | 'receive'
  | 'send'
  | 'copy'
  | 'check'
  | 'chevronRight'
  | 'chevronDown'
  | 'refresh'
  | 'key'
  | 'wallet'
  | 'close'
  | 'info'
  | 'swap'
  | 'plus';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/** Small hand-drawn stroke icon set, so no icon font dependency is needed. */
export function Icon({
  name,
  size = 22,
  color = colors.ink,
  strokeWidth = 1.9,
}: IconProps) {
  const stroke = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {name === 'home' && (
        <>
          <Path d="M3 10.5 12 3l9 7.5" {...stroke} />
          <Path d="M5.5 9v11h13V9" {...stroke} />
          <Path d="M10 20v-5.5h4V20" {...stroke} />
        </>
      )}
      {name === 'activity' && (
        <>
          <Path d="M7 4v16" {...stroke} />
          <Path d="m3.5 7.5 3.5-3.5 3.5 3.5" {...stroke} />
          <Path d="M17 20V4" {...stroke} />
          <Path d="m20.5 16.5-3.5 3.5-3.5-3.5" {...stroke} />
        </>
      )}
      {name === 'lab' && (
        <>
          <Path d="M9.5 3h5" {...stroke} />
          <Path
            d="M10.5 3v6.2L5 18.5A1.7 1.7 0 0 0 6.5 21h11a1.7 1.7 0 0 0 1.5-2.5L13.5 9.2V3"
            {...stroke}
          />
          <Path d="M7.6 15h8.8" {...stroke} />
        </>
      )}
      {name === 'settings' && (
        <>
          <Circle cx={12} cy={12} r={3} {...stroke} />
          <Path
            d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"
            {...stroke}
          />
        </>
      )}
      {name === 'receive' && (
        <>
          <Path d="M12 4v13" {...stroke} />
          <Path d="m6.5 11.5 5.5 5.5 5.5-5.5" {...stroke} />
          <Path d="M5 20h14" {...stroke} />
        </>
      )}
      {name === 'send' && (
        <>
          <Path d="M12 20V7" {...stroke} />
          <Path d="m6.5 12.5 5.5-5.5 5.5 5.5" {...stroke} />
          <Path d="M5 4h14" {...stroke} />
        </>
      )}
      {name === 'copy' && (
        <>
          <Rect
            x={8.5}
            y={8.5}
            width={11.5}
            height={11.5}
            rx={2.5}
            {...stroke}
          />
          <Path
            d="M15.5 8.5V6A2 2 0 0 0 13.5 4H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"
            {...stroke}
          />
        </>
      )}
      {name === 'check' && <Path d="m5 12.5 4.5 4.5L19 7.5" {...stroke} />}
      {name === 'chevronRight' && (
        <Path d="m9.5 5.5 6.5 6.5-6.5 6.5" {...stroke} />
      )}
      {name === 'chevronDown' && (
        <Path d="m5.5 9.5 6.5 6.5 6.5-6.5" {...stroke} />
      )}
      {name === 'refresh' && (
        <>
          <Path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" {...stroke} />
          <Path d="M4 4v4h4" {...stroke} />
          <Path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" {...stroke} />
          <Path d="M20 20v-4h-4" {...stroke} />
        </>
      )}
      {name === 'key' && (
        <>
          <Circle cx={8} cy={15} r={4.5} {...stroke} />
          <Path d="m11.3 11.7 8.2-8.2M16.5 6.5l2.5 2.5M14 9l2 2" {...stroke} />
        </>
      )}
      {name === 'wallet' && (
        <>
          <Path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" {...stroke} />
          <Rect x={4} y={8} width={16.5} height={11} rx={2.5} {...stroke} />
          <Circle cx={16} cy={13.5} r={1.2} {...stroke} />
        </>
      )}
      {name === 'close' && <Path d="m6 6 12 12M18 6 6 18" {...stroke} />}
      {name === 'info' && (
        <>
          <Circle cx={12} cy={12} r={9} {...stroke} />
          <Path d="M12 11v5.5M12 7.6v.1" {...stroke} />
        </>
      )}
      {name === 'swap' && (
        <>
          <Path d="M4 8h14l-3.5-3.5" {...stroke} />
          <Path d="M20 16H6l3.5 3.5" {...stroke} />
        </>
      )}
      {name === 'plus' && <Path d="M12 5v14M5 12h14" {...stroke} />}
    </Svg>
  );
}
