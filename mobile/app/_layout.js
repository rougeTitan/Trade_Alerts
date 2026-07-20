import React from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';
import { AuthProvider } from '../src/auth/AuthContext';

function RootLayoutInner() {
  const { theme, isDark } = useTheme();

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#0f1117' }} />;
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <RootLayoutInner />
      </AuthProvider>
    </ThemeProvider>
  );
}
