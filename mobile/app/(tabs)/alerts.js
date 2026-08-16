import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Platform,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Keyframe,
  LinearTransition,
  FadeIn,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeContext';
import api from '../../src/services/api';

// Exit animation: scale 0.5, y -50, rotate -30deg, 0.3s (per design spec)
const CardExit = new Keyframe({
  0: { opacity: 1, transform: [{ scale: 1 }, { translateY: 0 }, { rotate: '0deg' }] },
  100: { opacity: 0, transform: [{ scale: 0.5 }, { translateY: -50 }, { rotate: '-30deg' }] },
}).duration(300);

function PulsingZap({ color }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(withTiming(1.25, { duration: 600 }), withTiming(1, { duration: 600 })),
      -1,
      false
    );
    opacity.value = withRepeat(
      withSequence(withTiming(0.5, { duration: 600 }), withTiming(1, { duration: 600 })),
      -1,
      false
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={style}>
      <Ionicons name="flash" size={12} color={color} />
    </Animated.View>
  );
}

function priorityFor(percent) {
  const abs = Math.abs(percent);
  if (abs < 1) return 'high';
  if (abs < 3) return 'medium';
  return 'low';
}

function AlertCard({ alert, colors, onDismiss }) {
  const [hovered, setHovered] = useState(false);
  const isBelow = (alert.direction || '').toLowerCase().includes('below');
  const dirColor = isBelow ? colors.red : colors.green;

  const price = parseFloat(alert.current_price || 0);
  const firstTarget = alert.targets?.[0]?.price || 0;
  const percent = firstTarget ? ((price - firstTarget) / firstTarget) * 100 : 0;
  const priority = priorityFor(percent);

  const PRIORITY = {
    high: { color: colors.red, label: 'HIGH' },
    medium: { color: colors.yellow, label: 'MEDIUM' },
    low: { color: colors.textSecondary, label: 'LOW' },
  };
  const pr = PRIORITY[priority];

  const webHover = Platform.OS === 'web'
    ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
    : {};

  return (
    <Animated.View
      entering={FadeIn.duration(250)}
      exiting={CardExit}
      layout={LinearTransition.springify().damping(16).stiffness(140)}
      style={styles.cardWrapper}
    >
      <View
        {...webHover}
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: hovered ? colors.accent : colors.border },
          Platform.OS === 'web' && {
            transition: 'transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
            transform: hovered ? 'translateY(-5px)' : 'translateY(0)',
            boxShadow: hovered ? `0 8px 24px ${colors.accent}33` : 'none',
          },
        ]}
      >
        {/* Header: trend icon, symbol, sector, delete */}
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <View style={[styles.trendIcon, { backgroundColor: dirColor + '18' }]}>
              <Ionicons name={isBelow ? 'trending-down' : 'trending-up'} size={16} color={dirColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.symbol, { color: colors.text }]}>{alert.ticker}</Text>
              <Text style={[styles.company, { color: colors.textSecondary }]} numberOfLines={1}>{alert.sector}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Price + change */}
        <View style={styles.priceRow}>
          <Text style={[styles.price, { color: colors.text }]}>${price.toFixed(2)}</Text>
          <View style={styles.changeRow}>
            <Ionicons name={percent < 0 ? 'arrow-down' : 'arrow-up'} size={13} color={dirColor} />
            <Text style={[styles.changePct, { color: dirColor }]}>{Math.abs(percent).toFixed(2)}%</Text>
          </View>
        </View>

        {/* Priority badge + pills */}
        <View style={styles.pillRow}>
          <View style={[styles.priorityBadge, { backgroundColor: pr.color + '20', borderColor: pr.color + '40' }]}>
            <View style={[styles.priorityDot, { backgroundColor: pr.color }]} />
            <Text style={[styles.priorityText, { color: pr.color }]}>{pr.label}</Text>
          </View>
          <View style={[styles.typePill, { backgroundColor: dirColor + '15', borderColor: dirColor + '35' }]}>
            <Text style={[styles.pillText, { color: dirColor }]}>{isBelow ? 'BELOW' : 'ABOVE'}</Text>
          </View>
          {firstTarget > 0 && (
            <View style={[styles.typePill, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
              <Text style={[styles.pillText, { color: colors.textSecondary }]}>${firstTarget.toFixed(2)}</Text>
            </View>
          )}
        </View>

        {/* Footer: timestamp + triggered indicator */}
        <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
          <Text style={[styles.timestamp, { color: colors.textSecondary }]} numberOfLines={1}>
            {alert.latest?.split(' ')[1] || alert.latest}
          </Text>
          <View style={styles.triggeredRow}>
            <PulsingZap color={colors.yellow} />
            <Text style={[styles.triggeredText, { color: colors.yellow }]}>Triggered</Text>
          </View>
        </View>

        {/* Hover delete footer (web) */}
        {hovered && Platform.OS === 'web' && (
          <TouchableOpacity onPress={onDismiss} style={[styles.deleteFooter, { backgroundColor: colors.red + '15' }]}>
            <Ionicons name="trash-outline" size={13} color={colors.red} />
            <Text style={[styles.deleteFooterText, { color: colors.red }]}>Dismiss Alert</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

export default function AlertsScreen() {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const { width } = useWindowDimensions();

  const [alerts, setAlerts] = useState([]);
  const [groupedAlerts, setGroupedAlerts] = useState([]);
  const [filteredAlerts, setFilteredAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  const loadAlerts = useCallback(async () => {
    try {
      const data = await api.getAlerts();
      setAlerts(data);

      const grouped = {};
      data.forEach(alert => {
        const key = `${alert.ticker}-${alert.direction}`;
        if (!grouped[key]) {
          grouped[key] = {
            ticker: alert.ticker,
            direction: alert.direction,
            sector: alert.sector,
            current_price: alert.current_price,
            targets: [],
            latest: alert.timestamp,
          };
        }
        grouped[key].targets.push({
          price: parseFloat(alert.target_price || 0),
          timestamp: alert.timestamp,
        });
        if (alert.timestamp > grouped[key].latest) {
          grouped[key].latest = alert.timestamp;
        }
      });

      setGroupedAlerts(Object.values(grouped));
    } catch (e) {
      console.warn('Failed to load alerts:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    let filtered = groupedAlerts;
    if (searchQuery) {
      filtered = filtered.filter(a => a.ticker?.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    if (activeFilter === 'above') {
      filtered = filtered.filter(a => !(a.direction || '').toLowerCase().includes('below'));
    } else if (activeFilter === 'below') {
      filtered = filtered.filter(a => (a.direction || '').toLowerCase().includes('below'));
    }
    setFilteredAlerts(filtered);
  }, [groupedAlerts, searchQuery, activeFilter]);

  const handleDismissAlert = useCallback(async (ticker, direction) => {
    setGroupedAlerts(prev => prev.filter(a => !(a.ticker === ticker && a.direction === direction)));
    setAlerts(prev => prev.filter(a => !(a.ticker === ticker && a.direction === direction)));
    try {
      await api.dismissAlert(ticker, direction);
    } catch (e) {
      console.warn('Dismiss alert failed:', e.message);
    }
  }, []);

  const handleReset = useCallback(async () => {
    try {
      await api.clearAlerts();
      setAlerts([]);
      setGroupedAlerts([]);
    } catch (e) {
      console.warn('Clear failed:', e.message);
    }
  }, []);

  const handleRestore = useCallback(() => {
    setLoading(true);
    loadAlerts();
  }, [loadAlerts]);

  // Reload alerts every time the tab gains focus
  useFocusEffect(
    useCallback(() => {
      loadAlerts();
    }, [loadAlerts])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAlerts();
  }, [loadAlerts]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.accent} />
        </View>
      </View>
    );
  }

  const numColumns = width > 1300 ? 4 : width > 900 ? 3 : width > 550 ? 2 : 1;
  const triggeredCount = groupedAlerts.reduce((sum, a) => sum + (a.targets?.length || 0), 0);

  // Pad the last row with invisible spacers so cards keep an even width and
  // don't stretch to fill leftover space (which caused uneven gaps).
  const gridData = React.useMemo(() => {
    if (numColumns <= 1 || filteredAlerts.length === 0) return filteredAlerts;
    const remainder = filteredAlerts.length % numColumns;
    if (remainder === 0) return filteredAlerts;
    const fillers = Array.from({ length: numColumns - remainder }, (_, i) => ({
      __placeholder: true,
      id: `__ph-${i}`,
    }));
    return [...filteredAlerts, ...fillers];
  }, [filteredAlerts, numColumns]);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <View style={styles.headerLeftGroup}>
          <View style={[styles.bellWrap, { backgroundColor: c.accent + '18' }]}>
            <Ionicons name="notifications" size={18} color={c.accent} />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: c.text }]}>Stock Alerts</Text>
            <Text style={[styles.headerSub, { color: c.textSecondary }]}>
              {groupedAlerts.length} alerts · {triggeredCount} triggered
            </Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          {groupedAlerts.length > 0 && (
            <TouchableOpacity onPress={handleReset} style={[styles.resetBtn, { borderColor: c.border }]}>
              <Ionicons name="refresh" size={14} color={c.textSecondary} />
              <Text style={[styles.resetText, { color: c.textSecondary }]}>Reset</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => router.push('/(tabs)/dashboard')} style={[styles.addBtn, { backgroundColor: c.accent }]}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.addText}>Add Alert</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Toolbar */}
      <View style={[styles.toolbar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <View style={[styles.searchBox, { backgroundColor: c.background, borderColor: c.border }]}>
          <Ionicons name="search" size={14} color={c.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: c.text }]}
            placeholder="Search..."
            placeholderTextColor={c.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <TouchableOpacity
          style={[styles.filterChip, { backgroundColor: activeFilter === 'all' ? c.accent : c.surface2 }]}
          onPress={() => setActiveFilter('all')}
        >
          <Text style={[styles.filterText, { color: activeFilter === 'all' ? '#fff' : c.text }]}>All</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, { backgroundColor: activeFilter === 'above' ? c.green : c.surface2 }]}
          onPress={() => setActiveFilter('above')}
        >
          <Text style={[styles.filterText, { color: activeFilter === 'above' ? '#fff' : c.text }]}>Above</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, { backgroundColor: activeFilter === 'below' ? c.red : c.surface2 }]}
          onPress={() => setActiveFilter('below')}
        >
          <Text style={[styles.filterText, { color: activeFilter === 'below' ? '#fff' : c.text }]}>Below</Text>
        </TouchableOpacity>
      </View>

      {/* Cards Grid */}
      <FlatList
        data={gridData}
        key={numColumns}
        numColumns={numColumns}
        keyExtractor={(item) => (item.__placeholder ? item.id : `${item.ticker}-${item.direction}`)}
        renderItem={({ item }) => {
          if (item.__placeholder) {
            return <View style={styles.cardWrapper} />;
          }
          return (
            <AlertCard
              alert={item}
              colors={c}
              onDismiss={() => handleDismissAlert(item.ticker, item.direction)}
            />
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.emptyBell, { backgroundColor: c.accent + '15' }]}>
              <Ionicons name="notifications-off-outline" size={40} color={c.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: c.text }]}>No alerts yet</Text>
            <Text style={[styles.emptyDesc, { color: c.textSecondary }]}>
              You're all caught up. Restore to reload triggered alerts from the monitor.
            </Text>
            <TouchableOpacity onPress={handleRestore} style={[styles.restoreBtn, { backgroundColor: c.accent }]}>
              <Ionicons name="refresh" size={15} color="#fff" />
              <Text style={styles.restoreText}>Restore Alerts</Text>
            </TouchableOpacity>
          </View>
        }
        contentContainerStyle={filteredAlerts.length === 0 ? styles.emptyContainer : styles.gridContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
        showsVerticalScrollIndicator={false}
        columnWrapperStyle={numColumns > 1 && filteredAlerts.length > 0 ? styles.gridRow : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeftGroup: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  bellWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  headerSub: { fontSize: 11, fontWeight: '500', marginTop: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  resetText: { fontSize: 12, fontWeight: '600' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Toolbar
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: 1,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 13, outlineStyle: 'none' },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  filterText: { fontSize: 11, fontWeight: '600' },

  // Grid
  gridContent: { padding: 12 },
  gridRow: { gap: 12 },

  // Empty state
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  empty: { alignItems: 'center', gap: 14 },
  emptyBell: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyDesc: { fontSize: 13, textAlign: 'center', maxWidth: 280, lineHeight: 19 },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 10,
    marginTop: 4,
  },
  restoreText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Card
  cardWrapper: { flex: 1, minWidth: 0, marginBottom: 12 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  trendIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbol: { fontSize: 16, fontWeight: '800' },
  company: { fontSize: 11, fontWeight: '500', marginTop: 1 },

  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  price: { fontSize: 26, fontWeight: '800', letterSpacing: 0.3 },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 3 },
  changePct: { fontSize: 13, fontWeight: '700' },

  pillRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  priorityDot: { width: 6, height: 6, borderRadius: 3 },
  priorityText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  typePill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  pillText: { fontSize: 10, fontWeight: '700' },

  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 10,
  },
  timestamp: { fontSize: 11, fontWeight: '500', flex: 1 },
  triggeredRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  triggeredText: { fontSize: 10, fontWeight: '700' },

  deleteFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
    borderRadius: 9,
  },
  deleteFooterText: { fontSize: 12, fontWeight: '700' },
});
