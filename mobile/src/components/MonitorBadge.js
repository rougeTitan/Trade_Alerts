import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

export default function MonitorBadge({ running, onPress }) {
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <TouchableOpacity
      style={[
        styles.badge,
        {
          backgroundColor: running ? c.green + '18' : c.red + '18',
          borderColor: running ? c.green + '40' : c.red + '40',
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.dot, { backgroundColor: running ? c.green : c.red }]} />
      <Text style={[styles.text, { color: running ? c.green : c.red }]}>
        {running ? 'ON' : 'OFF'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
  },
});
