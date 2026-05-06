/**
 * Social sign-in buttons matching the web auth modal styling.
 * Auto-hides itself in environments where expo-auth-session can't load
 * (e.g. Expo Go without ExpoCryptoAES). The auth screen still renders
 * email + phone OTP regardless.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '../../constants/colors';
import type { SocialResult } from '../../utils/oauth';

interface Props {
  onSuccess: (r: SocialResult) => void;
  onError?: (msg: string) => void;
  disabled?: boolean;
}

function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16.1 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.4 6.3 14.7z" />
      <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.3 2.4-5.2 0-9.6-3.3-11.2-8l-6.5 5C9.5 39.5 16.2 44 24 44z" />
      <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4 5.7l6.2 5.2c-.4.4 6.5-4.7 6.5-14.9 0-1.3-.1-2.4-.4-3.5z" />
    </Svg>
  );
}

function MicrosoftMark({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 23 23">
      <Path fill="#f25022" d="M1 1h10v10H1z" />
      <Path fill="#00a4ef" d="M1 12h10v10H1z" />
      <Path fill="#7fba00" d="M12 1h10v10H12z" />
      <Path fill="#ffb900" d="M12 12h10v10H12z" />
    </Svg>
  );
}

export default function SocialAuthButtons({ onSuccess, onError, disabled }: Props) {
  const [supported, setSupported] = useState<boolean>(Platform.OS === 'web');
  const [busy, setBusy] = useState<'google' | 'microsoft' | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { oauthSupported } = await import('../../utils/oauth');
        const ok = await oauthSupported();
        if (alive) setSupported(ok);
      } catch {
        if (alive) setSupported(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!supported) return null;

  const handle = async (provider: 'google' | 'microsoft') => {
    if (busy) return;
    setBusy(provider);
    try {
      const oauth = await import('../../utils/oauth');
      const r = provider === 'google' ? await oauth.startGoogleSignIn() : await oauth.startMicrosoftSignIn();
      if (r.status === 'cancelled') return;
      if (r.status === 'unsupported') {
        setSupported(false);
        return;
      }
      if (r.status === 'error') { onError?.(r.error || 'Sign-in failed'); return; }
      onSuccess(r);
    } catch (e: any) {
      onError?.(e?.message || 'Sign-in failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.wrap}>
      <SocialBtn
        label="Continue with Google"
        icon={<GoogleMark />}
        loading={busy === 'google'}
        disabled={disabled || !!busy}
        onPress={() => handle('google')}
        testID="social-google-btn"
      />
      <SocialBtn
        label="Continue with Microsoft"
        icon={<MicrosoftMark />}
        loading={busy === 'microsoft'}
        disabled={disabled || !!busy}
        onPress={() => handle('microsoft')}
        testID="social-microsoft-btn"
      />
    </View>
  );
}

function SocialBtn({ label, icon, loading, disabled, onPress, testID }: any) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={({ pressed }) => [
        styles.btn,
        pressed && { backgroundColor: Colors.slate50 },
        disabled && { opacity: 0.5 },
      ]}
    >
      <View style={styles.iconBox}>{loading ? <ActivityIndicator size="small" color={Colors.slate700} /> : icon}</View>
      <Text style={styles.btnText}>{label}</Text>
      <View style={{ width: 18 }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  btn: {
    height: 40, borderRadius: 6, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.white, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
  },
  iconBox: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  btnText: {
    flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '500', color: Colors.slate900,
    fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_500Medium',
  },
});
