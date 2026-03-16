import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeContext';
import api from '../../src/services/api';

export default function AlertsScreen() {
  const { theme } = useTheme();
  const c = theme.colors;

  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAlerts = useCallback(async () => {
    try {
      const data = await api.getAlerts();
      setAlerts(data);
    } catch (e) {
      console.warn('Failed to load alerts:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <Ionicons name="notifications-outline" size={22} color={c.accent} />
        <Text style={[styles.headerTitle, { color: c.text }]}>Alert History</Text>
        <Text style={[styles.headerCount, { color: c.textSecondary }]}>{alerts.length} alerts</Text>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={alerts.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {alerts.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-circle-outline" size={52} color={c.textSecondary} />
            <Text style={[styles.emptyTitle, { color: c.text }]}>No alerts yet</Text>
            <Text style={[styles.emptyDesc, { color: c.textSecondary }]}>
              Alerts will appear here when your price targets are breached.
            </Text>
          </View>
        ) : (
          alerts.map((alert, index) => {
            const isBelow = (alert.direction || '').toLowerCase().includes('below');
            const dirColor = isBelow ? c.red : c.green;
            const price = parseFloat(alert.current_price || 0);
            const target = parseFloat(alert.target_price || 0);

            return (
              <View
                key={index}
                style={[styles.alertCard, { backgroundColor: c.surface, borderColor: c.border }]}
              >
                <View style={styles.alertTop}>
                  <Text style={[styles.alertTicker, { color: c.accent }]}>{alert.ticker}</Text>
                  <Text style={[styles.alertTime, { color: c.textSecondary }]}>{alert.timestamp}</Text>
                </View>
                <View style={styles.alertDetail}>
                  <Text style={[styles.alertPrice, { color: c.text }]}>
                    ${price.toFixed(2)}
                  </Text>
                  <Text style={[styles.alertDirection, { color: dirColor }]}>
                    {alert.direction}
                  </Text>
                  <Text style={[styles.alertTarget, { color: c.textSecondary }]}>
                    target ${target.toFixed(2)}
                  </Text>
                </View>
                <Text style={[styles.alertSector, { color: c.textSecondary }]}>{alert.sector}</Text>
              </View>
            );
          })
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', flex: 1 },
  headerCount: { fontSize: 13, fontWeight: '500' },
  list: { flex: 1 },
  listContent: { padding: 16 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  empty: { alignItems: 'center', gap: 8, paddingTop: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyDesc: { fontSize: 13, textAlign: 'center', lineHeight: 20, maxWidth: 260 },
  alertCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  alertTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  alertTicker: { fontSize: 16, fontWeight: '800' },
  alertTime: { fontSize: 11 },
  alertDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  alertPrice: { fontSize: 15, fontWeight: '700' },
  alertDirection: { fontSize: 13, fontWeight: '700' },
  alertTarget: { fontSize: 13 },
  alertSector: { fontSize: 11, marginTop: 2 },
});
