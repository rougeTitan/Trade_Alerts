import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useTheme } from '../../src/theme/ThemeContext';
import api from '../../src/services/api';
import SectorDrawer from '../../src/components/SectorDrawer';
import StockRow from '../../src/components/StockRow';
import SummaryCards from '../../src/components/SummaryCards';
import EditTargetsModal from '../../src/components/EditTargetsModal';
import AddStockModal from '../../src/components/AddStockModal';
import AddSectorModal from '../../src/components/AddSectorModal';
import MonitorBadge from '../../src/components/MonitorBadge';

export default function DashboardScreen() {
  const router = useRouter();
  const { theme, isDark, toggleTheme } = useTheme();
  const c = theme.colors;

  const [watchlist, setWatchlist] = useState({});
  const [activeSector, setActiveSector] = useState('__all__');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [monitorRunning, setMonitorRunning] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Modals
  const [editModal, setEditModal] = useState({ visible: false, ticker: null, sector: null, targets: [] });
  const [addStockModal, setAddStockModal] = useState(false);
  const [addSectorModal, setAddSectorModal] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [wl, status] = await Promise.all([
        api.getWatchlist(),
        api.getMonitorStatus(),
      ]);
      setWatchlist(wl);
      setMonitorRunning(status.running);
    } catch (e) {
      console.warn('Failed to load data:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh prices on first mount
  useEffect(() => {
    const autoRefresh = async () => {
      try {
        const updatedWatchlist = await api.refreshPrices();
        setWatchlist(updatedWatchlist);
      } catch (e) {
        console.warn('Auto price refresh failed:', e.message);
      }
    };
    autoRefresh();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const updatedWatchlist = await api.refreshPrices();
      setWatchlist(updatedWatchlist);
      const status = await api.getMonitorStatus();
      setMonitorRunning(status.running);
    } catch (e) {
      console.warn('Refresh failed:', e.message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleRefreshPrices = async () => {
    if (refreshingPrices) return;
    
    setRefreshingPrices(true);
    try {
      const updatedWatchlist = await api.refreshPrices();
      setWatchlist(updatedWatchlist);
    } catch (e) {
      console.warn('Price refresh failed:', e.message);
    } finally {
      setRefreshingPrices(false);
    }
  };

  const handleToggleMonitor = async () => {
    try {
      if (monitorRunning) {
        await api.stopMonitor();
        setMonitorRunning(false);
      } else {
        await api.startMonitor();
        setMonitorRunning(true);
      }
    } catch (e) {
      console.warn('Monitor toggle failed:', e.message);
    }
  };

  const handleCheckOnce = async () => {
    try {
      const { count } = await api.checkOnce();
      await loadData();
      if (count > 0) {
        router.push('/(tabs)/alerts');
      }
    } catch (e) {
      console.warn('Check once failed:', e.message);
    }
  };

  const handleEditTargets = (ticker, sector) => {
    const stocks = watchlist[sector] || [];
    const stock = stocks.find((s) => s.ticker === ticker);
    setEditModal({
      visible: true,
      ticker,
      sector,
      targets: stock?.targets || [],
    });
  };

  const handleSaveTargets = async (ticker, sector, targets) => {
    try {
      await api.setTargets(ticker, sector, targets);
      setEditModal({ visible: false, ticker: null, sector: null, targets: [] });
      loadData();
    } catch (e) {
      console.warn('Save targets failed:', e.message);
    }
  };

  const handleAddStock = async (sector, ticker) => {
    setAddStockModal(false);
    const tk = (ticker || '').trim().toUpperCase();
    // Optimistic: show the new card immediately (price/earnings fill in on reconcile).
    setWatchlist((prev) => {
      const existing = prev[sector] || [];
      if (existing.some((s) => s.ticker === tk)) return prev;
      return {
        ...prev,
        [sector]: [...existing, { ticker: tk, current_price: null, targets: [], earnings_date: null }],
      };
    });
    try {
      await api.addStock(sector, ticker);
    } catch (e) {
      console.warn('Add stock failed:', e.message);
    }
    loadData(); // reconcile in background
  };

  const handleRemoveStock = async (ticker, sector) => {
    // Optimistic: remove the card immediately.
    setWatchlist((prev) => ({
      ...prev,
      [sector]: (prev[sector] || []).filter((s) => s.ticker !== ticker),
    }));
    try {
      await api.removeStock(sector, ticker);
    } catch (e) {
      console.warn('Remove stock failed:', e.message);
    }
    loadData(); // reconcile in background
  };

  const handleAddSector = async (name) => {
    setAddSectorModal(false);
    // Optimistic: show the new (empty) sector immediately; getWatchlist is slow
    // because it fetches earnings dates for every ticker.
    setWatchlist((prev) => (prev[name] ? prev : { ...prev, [name]: [] }));
    try {
      await api.addSector(name);
    } catch (e) {
      console.warn('Add sector failed:', e.message);
    }
    loadData(); // reconcile in background
  };

  const handleDeleteSector = async (name) => {
    // Optimistic: drop the sector from local state right away.
    setWatchlist((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    if (activeSector === name) {
      setActiveSector('__all__');
    }
    try {
      await api.deleteSector(name);
    } catch (e) {
      console.warn('Delete sector failed:', e.message);
    }
    loadData(); // reconcile in background
  };

  // Build flat stock list based on active sector
  const sectors = Object.keys(watchlist);
  const visibleSectors = activeSector === '__all__' ? sectors : [activeSector];
  const stocks = [];
  for (const s of visibleSectors) {
    for (const stock of watchlist[s] || []) {
      stocks.push({ ...stock, sector: s });
    }
  }

  // Summary counts
  const allStocks = [];
  for (const s of sectors) for (const st of watchlist[s] || []) allStocks.push(st);
  const totalStocks = allStocks.length;
  const withTargets = allStocks.filter((s) => s.targets?.length > 0).length;
  const noTargets = totalStocks - withTargets;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.accent} />
          <Text style={[styles.loadingText, { color: c.textSecondary }]}>Loading watchlist…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* Top Bar */}
      <View style={[styles.topBar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => setDrawerOpen(true)} style={styles.menuBtn}>
          <Ionicons name="menu" size={24} color={c.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
          {activeSector === '__all__' ? 'All Stocks' : activeSector}
        </Text>
        <View style={styles.topBarRight}>
          <TouchableOpacity onPress={toggleTheme} style={styles.iconBtn}>
            <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={20} color={c.text} />
          </TouchableOpacity>
          <MonitorBadge running={monitorRunning} onPress={handleToggleMonitor} />
        </View>
      </View>

      {/* Action Bar */}
      <View style={[styles.actionBar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: c.accent, opacity: refreshingPrices ? 0.6 : 1 }]}
          onPress={handleRefreshPrices}
          disabled={refreshingPrices}
        >
          {refreshingPrices ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="refresh" size={14} color="#fff" />
          )}
          <Text style={styles.actionBtnText}>{refreshingPrices ? 'Refreshing...' : 'Refresh'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: c.surface2, borderColor: c.border, borderWidth: 1 }]}
          onPress={handleCheckOnce}
        >
          <Ionicons name="flash-outline" size={14} color={c.text} />
          <Text style={[styles.actionBtnTextAlt, { color: c.text }]}>Check Alerts</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: c.surface2, borderColor: c.border, borderWidth: 1 }]}
          onPress={async () => {
            const url = await api.uploadUrl();
            Linking.openURL(url);
          }}
        >
          <Ionicons name="cloud-upload-outline" size={14} color={c.accent} />
          <Text style={[styles.actionBtnTextAlt, { color: c.accent }]}>Upload</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: c.surface2, borderColor: c.border, borderWidth: 1 }]}
          onPress={() => router.push('/bulk-edit')}
        >
          <Ionicons name="list-outline" size={14} color={c.text} />
          <Text style={[styles.actionBtnTextAlt, { color: c.text }]}>Bulk Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: c.surface2, borderColor: c.border, borderWidth: 1 }]}
          onPress={() => setAddStockModal(true)}
        >
          <Ionicons name="add" size={14} color={c.accent} />
          <Text style={[styles.actionBtnTextAlt, { color: c.accent }]}>Stock</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: c.surface2, borderColor: c.border, borderWidth: 1 }]}
          onPress={() => setAddSectorModal(true)}
        >
          <Ionicons name="add" size={14} color={c.accent} />
          <Text style={[styles.actionBtnTextAlt, { color: c.accent }]}>Sector</Text>
        </TouchableOpacity>
      </View>

      {/* Summary Cards */}
      <SummaryCards
        totalStocks={totalStocks}
        withTargets={withTargets}
        noTargets={noTargets}
        sectors={sectors.length}
      />

      {/* Stock Grid */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
        showsVerticalScrollIndicator={true}
      >
        {stocks.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="folder-open-outline" size={48} color={c.textSecondary} />
            <Text style={[styles.emptyTitle, { color: c.text }]}>No stocks found</Text>
            <Text style={[styles.emptyDesc, { color: c.textSecondary }]}>
              Add stocks using the + Stock button above.
            </Text>
          </View>
        ) : (
          <View style={styles.stockGrid}>
            {stocks.map((stock) => (
              <StockRow
                key={`${stock.sector}-${stock.ticker}`}
                ticker={stock.ticker}
                price={stock.current_price}
                targets={stock.targets || []}
                sector={stock.sector}
                earningsDate={stock.earnings_date}
                onEdit={() => handleEditTargets(stock.ticker, stock.sector)}
                onRemove={() => handleRemoveStock(stock.ticker, stock.sector)}
              />
            ))}
          </View>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Sector Drawer */}
      <SectorDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sectors={watchlist}
        activeSector={activeSector}
        onSelect={(s) => {
          setActiveSector(s);
          setDrawerOpen(false);
        }}
        onDelete={(name) => {
          setDrawerOpen(false);
          handleDeleteSector(name);
        }}
      />

      {/* Modals */}
      <EditTargetsModal
        visible={editModal.visible}
        ticker={editModal.ticker}
        targets={editModal.targets}
        onSave={(targets) => handleSaveTargets(editModal.ticker, editModal.sector, targets)}
        onClose={() => setEditModal({ visible: false, ticker: null, sector: null, targets: [] })}
      />

      <AddStockModal
        visible={addStockModal}
        sectors={sectors}
        onAdd={handleAddStock}
        onClose={() => setAddStockModal(false)}
      />

      <AddSectorModal
        visible={addSectorModal}
        onAdd={handleAddSector}
        onClose={() => setAddSectorModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  menuBtn: { marginRight: 12 },
  title: { flex: 1, fontSize: 18, fontWeight: '700' },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { padding: 6 },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  actionBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  actionBtnTextAlt: { fontSize: 12, fontWeight: '600' },
  list: { flex: 1 },
  listContent: { padding: 8 }, // reduced from 16 to 8 for 3 cards fit
  stockGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyDesc: { fontSize: 13, textAlign: 'center' },
});
