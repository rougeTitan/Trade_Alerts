import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export default function TargetPill({ price, direction }) {
  const { theme } = useTheme();
  const c = theme.colors;

  const dir = (direction || 'BOTH').toUpperCase();
  let bg, border, color, arrow;

  if (dir === 'ABOVE') {
    bg = c.aboveBg;
    border = c.aboveBorder;
    color = c.green;
    arrow = '↑';
  } else if (dir === 'BELOW') {
    bg = c.belowBg;
    border = c.belowBorder;
    color = c.red;
    arrow = '↓';
  } else {
    bg = c.bothBg;
    border = c.bothBorder;
    color = c.yellow;
    arrow = '↕';
  }

  return (
    <View style={[styles.pill, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.text, { color }]}>
        ${price.toFixed(2)} {arrow}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
  },
});
