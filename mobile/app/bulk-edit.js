import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeContext';
import api from '../src/services/api';

function StockRow({ stock, editing, onStartEdit, onFinish, onChangeDraft, colors }) {
  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.cell, styles.symbolCell, { color: colors.text, fontWeight: '700' }]}>{stock.ticker}</Text>
      <Text style={[styles.cell, styles.priceCell, { color: colors.text }]}>${stock.current_price?.toFixed(2) || '—'}</Text>

      {[0, 1, 2].map((idx) => {
        const target = stock.targets[idx];
        const isEditing = editing?.ticker === stock.ticker && editing?.idx === idx;
        if (isEditing) {
          return (
            <TextInput
              key={idx}
              style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              value={editing.value}
              onChangeText={onChangeDraft}
              onBlur={() => onFinish(stock, idx)}
              onSubmitEditing={() => onFinish(stock, idx)}
              keyboardType="numeric"
              autoFocus
              selectTextOnFocus
              placeholder="—"
              placeholderTextColor={colors.textSecondary}
            />
          );
        }
        return (
          <TouchableOpacity
            key={idx}
            style={[styles.cell, styles.targetCell]}
            onPress={() => onStartEdit(stock, idx)}
          >
            <Text style={{ color: target ? colors.text : colors.textSecondary, fontSize: 13 }}>
              {target ? `$${target.price}` : '—'}
            </Text>
          </TouchableOpacity>
        );
      })}

      <Text style={[styles.cell, styles.sectorCell, { color: colors.textSecondary, fontSize: 12 }]}>{stock.sector}</Text>
    </View>
  );
}


export default function BulkEditScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.colors;

  const [stocks, setStocks] = useState([]);
  const [filteredStocks, setFilteredStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadStocks();
  }, []);

  useEffect(() => {
    if (searchQuery) {
      setFilteredStocks(stocks.filter(s => s.ticker.toLowerCase().includes(searchQuery.toLowerCase())));
    } else {
      setFilteredStocks(stocks);
    }
  }, [searchQuery, stocks]);

  const loadStocks = async () => {
    try {
      const wl = await api.getWatchlist();
      const allStocks = [];
      for (const sector in wl) {
        for (const stock of wl[sector]) {
          allStocks.push({ ...stock, sector });
        }
      }
      setStocks(allStocks);
      setFilteredStocks(allStocks);
    } catch (e) {
      console.warn('Load failed:', e.message);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (stock, idx) => {
    if (editing && editing.ticker === stock.ticker && editing.idx === idx) return;
    if (editing) {
      const prev = stocks.find((s) => s.ticker === editing.ticker && s.sector === editing.sector);
      if (prev) finishEditing(prev, editing.idx);
    }
    const value = stock.targets[idx]?.price != null ? String(stock.targets[idx].price) : '';
    setEditing({ ticker: stock.ticker, sector: stock.sector, idx, value });
  };

  const updateDraft = (value) => setEditing({ ...editing, value });

  const finishEditing = async (stock, idx) => {
    if (!editing || editing.ticker !== stock.ticker || editing.idx !== idx) return;
    const { value } = editing;
    const orig = stock.targets[idx]?.price != null ? String(stock.targets[idx].price) : '';
    if (value === orig) {
      setEditing(null);
      return;
    }
    const trimmed = value.trim();
    const newTargets = [0, 1, 2].map((i) => {
      if (i === idx) {
        if (trimmed === '') return null;
        const price = parseFloat(trimmed);
        if (isNaN(price)) return null;
        const base = stock.targets[i] || {};
        return { ...base, price };
      }
      return stock.targets[i] || null;
    });
    setEditing(null);
    try {
      await api.setTargets(stock.ticker, stock.sector, newTargets);
      await loadStocks();
    } catch (e) {
      console.warn('Save failed:', e.message);
    }
  };

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
      <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => router.push('/(tabs)/dashboard')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={c.text} />
          <Text style={[styles.backText, { color: c.text }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text }]}>Bulk Edit Targets</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/dashboard')} style={styles.doneBtn}>
          <Text style={[styles.backText, { color: c.accent }]}>Done</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.toolbar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <View style={[styles.searchBox, { backgroundColor: c.background, borderColor: c.border }]}>
          <Ionicons name="search" size={16} color={c.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: c.text }]}
            placeholder="Search symbols..."
            placeholderTextColor={c.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <Text style={[styles.count, { color: c.textSecondary }]}>
          {filteredStocks.length} stocks
        </Text>
      </View>

      <View style={[styles.tableHeader, { backgroundColor: c.surface2, borderBottomColor: c.border }]}>
        <Text style={[styles.headerCell, styles.symbolCell, { color: c.textSecondary }]}>Symbol</Text>
        <Text style={[styles.headerCell, styles.priceCell, { color: c.textSecondary }]}>Price</Text>
        <Text style={[styles.headerCell, styles.targetCell, { color: c.textSecondary }]}>Target 1</Text>
        <Text style={[styles.headerCell, styles.targetCell, { color: c.textSecondary }]}>Target 2</Text>
        <Text style={[styles.headerCell, styles.targetCell, { color: c.textSecondary }]}>Target 3</Text>
        <Text style={[styles.headerCell, styles.sectorCell, { color: c.textSecondary }]}>Sector</Text>
        <View style={styles.actionsCell} />
      </View>

      <ScrollView style={styles.table}>
        {filteredStocks.map((stock) => (
          <StockRow
            key={`${stock.sector}-${stock.ticker}`}
            stock={stock}
            editing={editing}
            onStartEdit={startEdit}
            onFinish={finishEditing}
            onChangeDraft={updateDraft}
            colors={c}
          />
        ))}
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontSize: 16, fontWeight: '600' },
  doneBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: '700', flex: 1, textAlign: 'center' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },
  count: { fontSize: 13, fontWeight: '600' },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerCell: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  table: { flex: 1 },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  editRow: { borderLeftWidth: 3 },
  cell: { fontSize: 13 },
  symbolCell: { width: 70 },
  priceCell: { width: 70 },
  targetCell: { width: 70 },
  sectorCell: { flex: 1 },
  actionsCell: { width: 80, flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  iconBtn: { padding: 4 },
  input: {
    width: 70,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    fontSize: 13,
    fontWeight: '600',
  },
});
