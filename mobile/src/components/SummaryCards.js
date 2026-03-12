import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export default function SummaryCards({ totalStocks, withTargets, noTargets, sectors }) {
  const { theme } = useTheme();
  const c = theme.colors;

  const cards = [
    { label: 'Stocks', value: totalStocks, color: c.accent },
    { label: 'With Targets', value: withTargets, color: c.green },
    { label: 'No Targets', value: noTargets, color: c.red },
    { label: 'Sectors', value: sectors, color: c.accent },
  ];

  return (
    <View style={styles.row}>
      {cards.map((card, i) => (
        <View key={i} style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.value, { color: card.color }]}>{card.value}</Text>
          <Text style={[styles.label, { color: c.textSecondary }]}>{card.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  card: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  value: { fontSize: 20, fontWeight: '800' },
  label: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
});
