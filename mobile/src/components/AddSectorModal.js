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

export default function AddSectorModal({ visible, onAdd, onClose }) {
  const { theme } = useTheme();
  const c = theme.colors;

  const [name, setName] = useState('');

  const handleAdd = () => {
    const n = name.trim();
    if (!n) return;
    onAdd(n);
    setName('');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: c.overlay }]}>
        <View style={[styles.modal, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: c.text }]}>Add Sector</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={c.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, { color: c.textSecondary }]}>Sector Name</Text>
          <TextInput
            style={[styles.input, { backgroundColor: c.surface2, borderColor: c.border, color: c.text }]}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Real Estate"
            placeholderTextColor={c.textSecondary}
            autoCapitalize="words"
          />

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, { borderColor: c.border }]} onPress={onClose}>
              <Text style={[styles.btnText, { color: c.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { backgroundColor: c.accent }]} onPress={handleAdd}>
              <Text style={[styles.btnText, { color: '#fff' }]}>Add Sector</Text>
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
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
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
