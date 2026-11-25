import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import TargetPill from './TargetPill';

export default function StockRow({ ticker, price, targets, suggestedTargets, targetsSource, sector, earningsDate, onEdit, onRemove }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const { width: screenWidth } = useWindowDimensions();
  const [hovered, setHovered] = useState(false);

  const padding = 16 * 2;
  const gap = 10;
  const cols = screenWidth > 900 ? 3 : screenWidth > 550 ? 2 : 1;
  const cardWidth = (screenWidth - padding - gap * (cols - 1)) / cols;

  const priceStr = price != null ? `$${price.toFixed(2)}` : '—';

  // Filter out empty target slots before rendering
  const savedTargets = (targets || []).filter((t) => t && t.price != null);
  const suggested = (suggestedTargets || []).filter((t) => t && t.price != null);
  // Show saved targets when present; otherwise fall back to auto-suggestions
  // (clearly labelled, dashed) that the user can persist via Edit Targets.
  const showingSuggested = savedTargets.length === 0 && suggested.length > 0;
  const validTargets = savedTargets.length ? savedTargets : suggested;
  const isAuto = savedTargets.length > 0 && targetsSource === 'auto';
  const differsFromSuggested =
    savedTargets.length > 0 && !isAuto && suggested.length > 0 &&
    (savedTargets.length !== suggested.length ||
      savedTargets.some((t, i) => Math.abs(t.price - suggested[i].price) >= 0.005));

  // Format earnings date
  const formatEarningsDate = (dateStr) => {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffTime = date - now;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays < 0) return null;
      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Tomorrow';
      if (diffDays <= 7) return `${diffDays}d`;
      if (diffDays <= 30) return `${Math.ceil(diffDays / 7)}w`;
      
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return null;
    }
  };
  
  const earningsLabel = formatEarningsDate(earningsDate);

  const webHoverProps = Platform.OS === 'web' ? {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  } : {};

  return (
    <View
      {...webHoverProps}
      style={[
        styles.card,
        {
          backgroundColor: c.surface,
          borderColor: hovered ? c.accent : c.border,
          width: cardWidth,
        },
        Platform.OS === 'web' && {
          transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
          transform: hovered ? 'scale(1.03) translateY(-4px)' : 'scale(1) translateY(0)',
          boxShadow: hovered ? `0 8px 24px ${c.accent}33` : 'none',
        },
      ]}
    >
      {/* Header row */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.ticker, { color: c.accent }]}>{ticker}</Text>
          <View style={styles.subheaderRow}>
            <Text style={[styles.sector, { color: c.textSecondary }]}>{sector}</Text>
            {earningsLabel && (
              <>
                <Text style={[styles.separator, { color: c.textSecondary }]}>•</Text>
                <View style={[styles.earningsBadge, { backgroundColor: c.yellow + '20', borderColor: c.yellow + '40' }]}>
                  <Ionicons name="calendar-outline" size={9} color={c.yellow} />
                  <Text style={[styles.earningsText, { color: c.yellow }]}>{earningsLabel}</Text>
                </View>
              </>
            )}
          </View>
        </View>
        <Text style={[styles.price, { color: c.text }]}>{priceStr}</Text>
      </View>

      {/* Targets */}
      {showingSuggested && (
        <View style={styles.suggestedTag}>
          <Ionicons name="sparkles-outline" size={9} color={c.textSecondary} />
          <Text style={[styles.suggestedTagText, { color: c.textSecondary }]}>
            Suggested — tap Edit to save
          </Text>
        </View>
      )}
      {isAuto && (
        <View style={styles.suggestedTag}>
          <Ionicons name="sparkles-outline" size={9} color={c.accent} />
          <Text style={[styles.suggestedTagText, { color: c.accent }]}>
            Auto levels — alerts active
          </Text>
        </View>
      )}
      <View style={styles.targetsRow}>
        {validTargets.length === 0 ? (
          <Text style={[styles.noTargets, { color: c.textSecondary }]}>No targets set</Text>
        ) : (
          validTargets.map((t, i) => (
            <TargetPill key={i} price={t.price} direction={t.direction} suggested={showingSuggested} />
          ))
        )}
      </View>
      {differsFromSuggested && (
        <Text style={[styles.suggestedTagText, { color: c.textSecondary, marginTop: 4 }]}>
          Auto suggests: {suggested.map((t) => `$${Number(t.price).toFixed(2)}`).join(' · ')}
        </Text>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.editBtn, { backgroundColor: c.accent + '15' }]} onPress={onEdit}>
          <Ionicons name="create-outline" size={14} color={c.accent} />
          <Text style={[styles.editBtnText, { color: c.accent }]}>Edit Targets</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onRemove} style={[styles.removeBtn, { backgroundColor: c.red + '15' }]}>
          <Ionicons name="trash-outline" size={14} color={c.red} />
          <Text style={[styles.removeBtnText, { color: c.red }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    cursor: 'default',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  headerLeft: { gap: 2, flex: 1 },
  ticker: { fontSize: 14, fontWeight: '800' },
  subheaderRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sector: { fontSize: 10, fontWeight: '500' },
  separator: { fontSize: 10, opacity: 0.5 },
  earningsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  earningsText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.2 },
  price: { fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
  targetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 8,
  },
  noTargets: { fontSize: 11, fontStyle: 'italic' },
  suggestedTag: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 4 },
  suggestedTagText: { fontSize: 9, fontWeight: '600', fontStyle: 'italic', letterSpacing: 0.2 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  editBtnText: { fontSize: 12, fontWeight: '600' },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  removeBtnText: { fontSize: 12, fontWeight: '600' },
});
