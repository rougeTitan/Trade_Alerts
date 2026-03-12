import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function SectorDrawer({ visible, onClose, sectors, activeSector, onSelect }) {
  const { theme } = useTheme();
  const c = theme.colors;

  const sectorNames = Object.keys(sectors);
  const totalStocks = sectorNames.reduce((sum, s) => sum + (sectors[s]?.length || 0), 0);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View
          style={[styles.drawer, { backgroundColor: c.surface }]}
          onStartShouldSetResponder={() => true}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: c.border }]}>
            <View style={styles.headerLeft}>
              <Text style={{ fontSize: 22 }}>📈</Text>
              <Text style={[styles.headerTitle, { color: c.accent }]}>Trade Alerts</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={c.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {/* All Stocks */}
            <TouchableOpacity
              style={[
                styles.item,
                activeSector === '__all__' && { backgroundColor: c.surface2, borderLeftColor: c.accent, borderLeftWidth: 3 },
              ]}
              onPress={() => onSelect('__all__')}
            >
              <Text
                style={[
                  styles.itemText,
                  { color: activeSector === '__all__' ? c.accent : c.textSecondary },
                  activeSector === '__all__' && styles.itemTextActive,
                ]}
              >
                All Stocks
              </Text>
              <View style={[styles.countBadge, activeSector === '__all__' ? { backgroundColor: c.accent } : { backgroundColor: c.surface2 }]}>
                <Text style={[styles.countText, { color: activeSector === '__all__' ? '#fff' : c.textSecondary }]}>
                  {totalStocks}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Sector items */}
            {sectorNames.map((name) => {
              const isActive = activeSector === name;
              return (
                <TouchableOpacity
                  key={name}
                  style={[
                    styles.item,
                    isActive && { backgroundColor: c.surface2, borderLeftColor: c.accent, borderLeftWidth: 3 },
                  ]}
                  onPress={() => onSelect(name)}
                >
                  <Text
                    style={[
                      styles.itemText,
                      { color: isActive ? c.accent : c.textSecondary },
                      isActive && styles.itemTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {name}
                  </Text>
                  <View style={[styles.countBadge, isActive ? { backgroundColor: c.accent } : { backgroundColor: c.surface2 }]}>
                    <Text style={[styles.countText, { color: isActive ? '#fff' : c.textSecondary }]}>
                      {sectors[name]?.length || 0}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row',
  },
  drawer: {
    width: SCREEN_WIDTH * 0.78,
    maxWidth: 320,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  list: { flex: 1, paddingTop: 8 },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  itemText: { fontSize: 14, flex: 1 },
  itemTextActive: { fontWeight: '700' },
  countBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 28,
    alignItems: 'center',
  },
  countText: { fontSize: 11, fontWeight: '600' },
});
