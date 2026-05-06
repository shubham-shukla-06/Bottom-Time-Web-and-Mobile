import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import useAuthStore from '../src/stores/authStore';

export default function RootLayout() {
  const fetchCurrentUser = useAuthStore((s) => s.fetchCurrentUser);

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="auth"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="listing/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="product/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="my-bookings" options={{ headerShown: false }} />
        <Stack.Screen name="booking/confirmation" options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="booking/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="dive-log/new" options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="dive-log/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="dive-planner" options={{ headerShown: false }} />
        <Stack.Screen name="surface-log/index" options={{ headerShown: false }} />
        <Stack.Screen name="surface-log/new" options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="messages" options={{ headerShown: false }} />
        <Stack.Screen name="thread/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="thread/[userId]" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="user/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="cart" options={{ headerShown: false }} />
        <Stack.Screen name="checkout" options={{ headerShown: false }} />
        <Stack.Screen name="order-confirmation" options={{ headerShown: false }} />
        <Stack.Screen name="orders" options={{ headerShown: false }} />
        <Stack.Screen name="order/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="wishlist" options={{ headerShown: false }} />
        <Stack.Screen name="bucket-list" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
