/**
 * AppleMark — Apple silhouette brand mark for the mobile app.
 *
 * The SVG path is copied verbatim from
 *   frontend/src/components/auth/AuthSteps.js (web `AppleIcon`)
 * which itself is a hand-normalised version of the Apple bitten-apple
 * silhouette fitted to a 24×24 viewBox. DO NOT swap this for a generic
 * "apple fruit" glyph (lucide-react-native's `Apple` is the fruit-with-stem
 * silhouette — wrong shape, wrong brand, wrong everything).
 */
import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
}

export default function AppleMark({ size = 22, color = '#000' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
      />
    </Svg>
  );
}
