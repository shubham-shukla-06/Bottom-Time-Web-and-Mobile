import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Text } from './Text';
import { Colors } from '../constants/colors';

interface Props {
  message?: string;
  size?: 'small' | 'large';
}

export default function LoadingSpinner({ message = 'Loading...', size = 'large' }: Props) {
  return (
    <View style={styles.container} testID="loading-spinner">
      <ActivityIndicator size={size} color={Colors.cyan400} />
      {message && <Text style={styles.text}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  text: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.slate500,
  },
});
