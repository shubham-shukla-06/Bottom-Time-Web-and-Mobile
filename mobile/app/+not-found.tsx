/**
 * Catch-all route for any unmatched deep link (incl. exp://...ngrok.io/--/).
 * Renders a friendly fallback with a Home button instead of expo-router's
 * raw 404.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../src/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import Icon from '../src/components/Icon';
import { Colors } from '../src/constants/colors';
import BottomTimeLogo from '../src/components/BottomTimeLogo';
import Button from '../src/components/ui/Button';

export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ title: 'Not found', headerShown: false }} />
      <SafeAreaView style={styles.container} testID="not-found-screen">
        <View style={styles.body}>
          <BottomTimeLogo size="md" showTM={false} />
          <Icon name="compass-outline" size={56} color={Colors.slate300} />
          <Text style={styles.title}>You're off the map.</Text>
          <Text style={styles.subtitle}>This page doesn't exist or the link is broken.</Text>
          <View style={styles.actions}>
            <Button variant="cyan" size="lg" onPress={() => router.replace('/')} testID="not-found-home-btn">
              Back to Discover
            </Button>
          </View>
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.slate900, marginTop: 8 },
  subtitle: { fontSize: 14, color: Colors.slate500, textAlign: 'center', marginTop: -8 },
  actions: { marginTop: 16, alignSelf: 'stretch' },
});
