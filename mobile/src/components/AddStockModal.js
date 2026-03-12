import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

export default function AddStockModal({ visible, sectors, onAdd, onClose }) {
  const { theme } = useTheme();
  const c = theme.colors;

  const [selectedSector, setSelectedSector] = useState(sectors[0] || '');
  const [ticker, setTicker] = useState('');

  const handleAdd = () => {
    const t = ticker.trim().toUpperCase();
    if (!t || !selectedSector) return;
    onAdd(selectedSector, t);
    setTicker('');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: c.overlay }]}>
        <View style={[styles.modal, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: c.text }]}>Add Stock</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={c.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Sector picker */}
          <Text style={[styles.label, { color: c.textSecondary }]}>Sector</Text>
          <View style={styles.sectorList}>
            {sectors.map((s) => (
              <TouchableOpacity
                key={s}
                style={[
                  styles.sectorChip,
                  {
                    backgroundColor: selectedSector === s ? c.accent + '20' : c.surface2,
                    borderColor: selectedSector === s ? c.accent : c.border,
                  },
                ]}
                onPress={() => setSelectedSector(s)}
              >
                <Text
                  style={[
                    styles.sectorChipText,
                    { color: selectedSector === s ? c.accent : c.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {s}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Ticker input */}
          <Text style={[styles.label, { color: c.textSecondary }]}>Ticker Symbol</Text>
          <TextInput
            style={[styles.input, { backgroundColor: c.surface2, borderColor: c.border, color: c.text }]}
            value={ticker}
            onChangeText={setTicker}
            placeholder="e.g. AAPL"
            placeholderTextColor={c.textSecondary}
            autoCapitalize="characters"
            autoCorrect={false}
          />

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, { borderColor: c.border }]} onPress={onClose}>
              <Text style={[styles.btnText, { color: c.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { backgroundColor: c.accent }]} onPress={handleAdd}>
              <Text style={[styles.btnText, { color: '#fff' }]}>Add Stock</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  modal: { width: '100%', maxWidth: 440, borderRadius: 16, borderWidth: 1, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
  sectorList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  sectorChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  sectorChipText: { fontSize: 12, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  btn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
  btnText: { fontSize: 13, fontWeight: '700' },
});
