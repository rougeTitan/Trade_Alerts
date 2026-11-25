import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeContext';
import UploadModal from '../../src/components/UploadModal';
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
  const [suggestions, setSuggestions] = useState({}); // { TICKER: [{price, direction}, ...] }
  const [calculatingTargets, setCalculatingTargets] = useState(false);
  const [checkingAlerts, setCheckingAlerts] = useState(false);
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
  const [uploadModal, setUploadModal] = useState(false);

  // Incremented whenever the user edits data. Any server response that was
  // requested before the latest edit is stale and must not overwrite state.
  const editEpoch = useRef(0);
  const markEdited = () => {
    editEpoch.current += 1;
  };
  const watchlistRef = useRef(watchlist);
  watchlistRef.current = watchlist;
  const applyIfFresh = (epochAtStart, wl) => {
    if (epochAtStart === editEpoch.current) setWatchlist(wl);
  };

  const loadData = useCallback(async () => {
    const epoch = editEpoch.current;
    try {
      const [wl, status] = await Promise.all([
        api.getWatchlist(),
        api.getMonitorStatus(),
      ]);
      applyIfFresh(epoch, wl);
      setMonitorRunning(status.running);
    } catch (e) {
      console.warn('Failed to load data:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload on mount and whenever the screen regains focus (e.g. returning
  // from Bulk Edit).
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Auto-refresh prices on first mount
  useEffect(() => {
    const autoRefresh = async () => {
      const epoch = editEpoch.current;
      try {
        const updatedWatchlist = await api.refreshPrices();
        applyIfFresh(epoch, updatedWatchlist);
      } catch (e) {
        console.warn('Auto price refresh failed:', e.message);
      }
    };
    autoRefresh();
  }, []);

  // Stable key for the current set of tickers (ignores price changes).
  const tickerSetKey = Object.keys(watchlist)
    .map((s) => (watchlist[s] || []).map((x) => x.ticker).join(','))
    .join('|');

  // Auto-compute suggested targets for every stock whenever the ticker set
  // changes. Non-blocking: cards render immediately, suggestions fill in when
  // the batch returns (cached server-side after the first call).
  useEffect(() => {
    const tickers = [];
    for (const s of Object.keys(watchlist)) {
      for (const st of watchlist[s] || []) if (st.ticker) tickers.push(st.ticker);
    }
    if (tickers.length === 0) return;

    let cancelled = false;
    setCalculatingTargets(true);
    const CHUNK = 10;
    const samePrices = (a, b) =>
      a.length === b.length &&
      a.every((t, i) => Math.abs(t.price - b[i].price) < 0.005 && t.direction === b[i].direction);

    const processChunk = async (chunk) => {
      try {
        const res = await api.getSuggestedTargets(chunk);
        if (cancelled) return;
        const map = {};
        for (const [sym, payload] of Object.entries(res.results || {})) {
          if (payload && !payload.error && Array.isArray(payload.targets) && payload.targets.length) {
            map[sym] = payload.targets.map((t) => ({ price: t.price, direction: t.direction }));
          }
        }
        setSuggestions((prev) => ({ ...prev, ...map }));

        // Auto-targets: stocks with no saved targets (or previously auto-filled
        // ones) get the suggested levels persisted so alerts use them. Custom
        // user targets are never overwritten.
        const updates = [];
        for (const [sector, stocks] of Object.entries(watchlistRef.current)) {
          for (const st of stocks || []) {
            const sugg = map[st.ticker];
            if (!sugg) continue;
            const saved = (st.targets || []).filter((t) => t && t.price != null);
            const isAuto = st.targets_source === 'auto';
            if (saved.length && !isAuto) continue;
            if (saved.length && samePrices(saved, sugg)) continue;
            updates.push({ sector, ticker: st.ticker, targets: sugg });
          }
        }
        if (updates.length) {
          markEdited();
          setWatchlist((prev) => {
            const next = { ...prev };
            for (const u of updates) {
              next[u.sector] = (next[u.sector] || []).map((s) =>
                s.ticker === u.ticker ? { ...s, targets: u.targets, targets_source: 'auto' } : s
              );
            }
            return next;
          });
          for (const u of updates) {
            try {
              await api.setTargets(u.ticker, u.sector, u.targets, 'auto');
            } catch (e) {
              console.warn('Auto-target save failed:', u.ticker, e.message);
            }
          }
        }
      } catch (e) {
        console.warn('Suggested targets failed:', e.message);
        return false;
      }
      return true;
    };

    (async () => {
      for (let i = 0; i < tickers.length; i += CHUNK) {
        if (cancelled) return;
        const ok = await processChunk(tickers.slice(i, i + CHUNK));
        // Endpoint missing/unavailable: stop instead of repeating the error.
        if (!ok) break;
      }
      if (!cancelled) setCalculatingTargets(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerSetKey]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const epoch = editEpoch.current;
    try {
      const updatedWatchlist = await api.refreshPrices();
      applyIfFresh(epoch, updatedWatchlist);
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
    const epoch = editEpoch.current;
    try {
      const updatedWatchlist = await api.refreshPrices();
      applyIfFresh(epoch, updatedWatchlist);
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
    if (checkingAlerts) return;
    setCheckingAlerts(true);
    try {
      const { count } = await api.checkOnce();
      if (count > 0) {
        router.push('/(tabs)/alerts');
      }
      loadData(); // refresh in background; don't block navigation
    } catch (e) {
      console.warn('Check once failed:', e.message);
    } finally {
      setCheckingAlerts(false);
    }
  };

  const handleEditTargets = (ticker, sector) => {
    const stocks = watchlist[sector] || [];
    const stock = stocks.find((s) => s.ticker === ticker);
    const savedValid = (stock?.targets || []).filter((t) => t && t.price != null);
    // Prefill saved targets if any; otherwise seed the modal with the
    // auto-suggested ones so the user can tweak and Save to persist.
    const prefill = savedValid.length ? stock.targets : (suggestions[ticker] || []);
    setEditModal({ visible: true, ticker, sector, targets: prefill });
  };

  const handleSaveTargets = async (ticker, sector, targets) => {
    const previous = watchlist;
    markEdited();
    setWatchlist((prev) => ({
      ...prev,
      [sector]: (prev[sector] || []).map((s) =>
        s.ticker === ticker ? { ...s, targets, targets_source: 'custom' } : s
      ),
    }));
    setEditModal({ visible: false, ticker: null, sector: null, targets: [] });
    try {
      await api.setTargets(ticker, sector, targets);
    } catch (e) {
      console.warn('Save targets failed:', e.message);
      setWatchlist(previous);
    }
    markEdited();
    loadData();
  };

  const handleAddStock = async (sector, ticker) => {
    setAddStockModal(false);
    const tk = (ticker || '').trim().toUpperCase();
    markEdited();
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
    markEdited();
    loadData(); // reconcile in background
    // New stocks have no price until prices are refreshed.
    const epoch = editEpoch.current;
    try {
      const updated = await api.refreshPrices();
      applyIfFresh(epoch, updated);
    } catch (e) {
      console.warn('Price refresh after add failed:', e.message);
    }
  };

  const handleRemoveStock = async (ticker, sector) => {
    markEdited();
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
    markEdited();
    loadData(); // reconcile in background
  };

  const handleAddSector = async (name) => {
    setAddSectorModal(false);
    // Optimistic: show the new (empty) sector immediately; getWatchlist is slow
    // because it fetches earnings dates for every ticker.
    markEdited();
    setWatchlist((prev) => (prev[name] ? prev : { ...prev, [name]: [] }));
    try {
      await api.addSector(name);
    } catch (e) {
      console.warn('Add sector failed:', e.message);
    }
    markEdited();
    loadData(); // reconcile in background
  };

  const handleDeleteSector = async (name) => {
    markEdited();
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
    markEdited();
    loadData(); // reconcile in background
  };

  const handleBulkImport = async (fileData) => {
    const res = await api.bulkImport(fileData);
    markEdited();
    loadData();
    return res;
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
  const withTargets = allStocks.filter((s) =>
    (s.targets || []).some((t) => t && t.price != null)
  ).length;
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
          disabled={checkingAlerts}
        >
          {checkingAlerts ? (
            <ActivityIndicator size="small" color={c.text} />
          ) : (
            <Ionicons name="flash-outline" size={14} color={c.text} />
          )}
          <Text style={[styles.actionBtnTextAlt, { color: c.text }]}>
            {checkingAlerts ? 'Checking...' : 'Check Alerts'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: c.surface2, borderColor: c.border, borderWidth: 1 }]}
          onPress={() => setUploadModal(true)}
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
        calculating={calculatingTargets}
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
                suggestedTargets={suggestions[stock.ticker] || []}
                targetsSource={stock.targets_source}
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

      <UploadModal
        visible={uploadModal}
        onClose={() => setUploadModal(false)}
        onImport={handleBulkImport}
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
