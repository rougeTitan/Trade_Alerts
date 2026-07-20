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

function EditableRow({ stock, onSave, onCancel, colors }) {
  const [t1, setT1] = useState(stock.targets[0]?.price || '');
  const [t2, setT2] = useState(stock.targets[1]?.price || '');
  const [t3, setT3] = useState(stock.targets[2]?.price || '');
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const orig1 = stock.targets[0]?.price || '';
    const orig2 = stock.targets[1]?.price || '';
    const orig3 = stock.targets[2]?.price || '';
    setHasChanges(t1 !== orig1 || t2 !== orig2 || t3 !== orig3);
  }, [t1, t2, t3]);

  const handleSave = () => {
    const targets = [];
    if (t1) targets.push({ price: parseFloat(t1), direction: stock.targets[0]?.direction || 'ABOVE' });
    if (t2) targets.push({ price: parseFloat(t2), direction: stock.targets[1]?.direction || 'ABOVE' });
    if (t3) targets.push({ price: parseFloat(t3), direction: stock.targets[2]?.direction || 'ABOVE' });
    onSave(stock.ticker, stock.sector, targets);
  };

  return (
    <View style={[styles.row, styles.editRow, { backgroundColor: colors.accent + '10', borderColor: colors.accent }]}>
      <Text style={[styles.cell, styles.symbolCell, { color: colors.text }]}>{stock.ticker}</Text>
      <Text style={[styles.cell, styles.priceCell, { color: colors.text }]}>${stock.current_price?.toFixed(2) || '—'}</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
        value={t1}
        onChangeText={setT1}
        keyboardType="numeric"
        placeholder="—"
        placeholderTextColor={colors.textSecondary}
      />
      <TextInput
        style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
        value={t2}
        onChangeText={setT2}
        keyboardType="numeric"
        placeholder="—"
        placeholderTextColor={colors.textSecondary}
      />
      <TextInput
        style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
        value={t3}
        onChangeText={setT3}
        keyboardType="numeric"
        placeholder="—"
        placeholderTextColor={colors.textSecondary}
      />
      <Text style={[styles.cell, styles.sectorCell, { color: colors.textSecondary }]}>{stock.sector}</Text>
      <View style={styles.actionsCell}>
        <TouchableOpacity
          onPress={handleSave}
          disabled={!hasChanges}
          style={[styles.iconBtn, { opacity: hasChanges ? 1 : 0.3 }]}
        >
          <Ionicons name="checkmark" size={18} color={colors.green} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel} style={styles.iconBtn}>
          <Ionicons name="close" size={18} color={colors.red} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ReadOnlyRow({ stock, onEdit, colors }) {
  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.cell, styles.symbolCell, { color: colors.text, fontWeight: '700' }]}>{stock.ticker}</Text>
      <Text style={[styles.cell, styles.priceCell, { color: colors.text }]}>${stock.current_price?.toFixed(2) || '—'}</Text>
      <Text style={[styles.cell, styles.targetCell, { color: colors.textSecondary }]}>
        {stock.targets[0]?.price ? `$${stock.targets[0].price}` : '—'}
      </Text>
      <Text style={[styles.cell, styles.targetCell, { color: colors.textSecondary }]}>
        {stock.targets[1]?.price ? `$${stock.targets[1].price}` : '—'}
      </Text>
      <Text style={[styles.cell, styles.targetCell, { color: colors.textSecondary }]}>
        {stock.targets[2]?.price ? `$${stock.targets[2].price}` : '—'}
      </Text>
      <Text style={[styles.cell, styles.sectorCell, { color: colors.textSecondary, fontSize: 12 }]}>{stock.sector}</Text>
      <View style={styles.actionsCell}>
        <TouchableOpacity onPress={() => onEdit(stock)} style={styles.iconBtn}>
          <Ionicons name="pencil" size={16} color={colors.accent} />
        </TouchableOpacity>
      </View>
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
  const [editingTicker, setEditingTicker] = useState(null);
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

  const handleEdit = (stock) => {
    setEditingTicker(stock.ticker);
  };

  const handleSave = async (ticker, sector, targets) => {
    try {
      await api.setTargets(ticker, sector, targets);
      setEditingTicker(null);
      await loadStocks();
    } catch (e) {
      console.warn('Save failed:', e.message);
    }
  };

  const handleCancel = () => {
    setEditingTicker(null);
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={c.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text }]}>Bulk Edit Targets</Text>
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
        <Text style={[styles.headerCell, styles.actionsCell, { color: c.textSecondary }]}>Actions</Text>
      </View>

      <ScrollView style={styles.table}>
        {filteredStocks.map((stock) => {
          const isEditing = editingTicker === stock.ticker;
          return isEditing ? (
            <EditableRow
              key={stock.ticker}
              stock={stock}
              onSave={handleSave}
              onCancel={handleCancel}
              colors={c}
            />
          ) : (
            <ReadOnlyRow
              key={stock.ticker}
              stock={stock}
              onEdit={handleEdit}
              colors={c}
            />
          );
        })}
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
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backBtn: { marginRight: 12 },
  headerTitle: { fontSize: 20, fontWeight: '700' },
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
