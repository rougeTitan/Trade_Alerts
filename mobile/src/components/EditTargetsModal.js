import React, { useState, useEffect } from 'react';
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

const DIRECTIONS = ['ABOVE', 'BELOW', 'BOTH'];

export default function EditTargetsModal({ visible, ticker, targets, onSave, onClose }) {
  const { theme } = useTheme();
  const c = theme.colors;

  const [t1Price, setT1Price] = useState('');
  const [t1Dir, setT1Dir] = useState('ABOVE');
  const [t2Price, setT2Price] = useState('');
  const [t2Dir, setT2Dir] = useState('ABOVE');
  const [t3Price, setT3Price] = useState('');
  const [t3Dir, setT3Dir] = useState('ABOVE');

  useEffect(() => {
    if (visible) {
      setT1Price(targets[0]?.price?.toString() || '');
      setT1Dir(targets[0]?.direction || 'ABOVE');
      setT2Price(targets[1]?.price?.toString() || '');
      setT2Dir(targets[1]?.direction || 'ABOVE');
      setT3Price(targets[2]?.price?.toString() || '');
      setT3Dir(targets[2]?.direction || 'ABOVE');
    }
  }, [visible, targets]);

  const handleSave = () => {
    const result = [];
    if (t1Price && parseFloat(t1Price) > 0) result.push({ price: parseFloat(t1Price), direction: t1Dir });
    if (t2Price && parseFloat(t2Price) > 0) result.push({ price: parseFloat(t2Price), direction: t2Dir });
    if (t3Price && parseFloat(t3Price) > 0) result.push({ price: parseFloat(t3Price), direction: t3Dir });
    onSave(result);
  };

  const handleClear = () => {
    setT1Price(''); setT1Dir('ABOVE');
    setT2Price(''); setT2Dir('ABOVE');
    setT3Price(''); setT3Dir('ABOVE');
  };

  const renderTargetGroup = (label, price, setPrice, dir, setDir) => (
    <View style={[styles.targetGroup, { backgroundColor: c.background, borderColor: c.border }]}>
      <Text style={[styles.targetLabel, { color: c.textSecondary }]}>{label}</Text>
      <View style={styles.targetRow}>
        <TextInput
          style={[styles.input, { backgroundColor: c.surface2, borderColor: c.border, color: c.text }]}
          value={price}
          onChangeText={setPrice}
          placeholder="0.00"
          placeholderTextColor={c.textSecondary}
          keyboardType="decimal-pad"
        />
        <View style={styles.dirBtns}>
          {DIRECTIONS.map((d) => {
            const active = dir === d;
            let btnColor = c.yellow;
            if (d === 'ABOVE') btnColor = c.green;
            if (d === 'BELOW') btnColor = c.red;
            return (
              <TouchableOpacity
                key={d}
                style={[
                  styles.dirBtn,
                  {
                    backgroundColor: active ? btnColor + '20' : c.surface2,
                    borderColor: active ? btnColor : c.border,
                  },
                ]}
                onPress={() => setDir(d)}
              >
                <Text style={[styles.dirBtnText, { color: active ? btnColor : c.textSecondary }]}>
                  {d === 'ABOVE' ? '↑' : d === 'BELOW' ? '↓' : '↕'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: c.overlay }]}>
        <View style={[styles.modal, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: c.text }]}>Edit Targets — {ticker}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={c.textSecondary} />
            </TouchableOpacity>
          </View>

          {renderTargetGroup('Target 1', t1Price, setT1Price, t1Dir, setT1Dir)}
          {renderTargetGroup('Target 2', t2Price, setT2Price, t2Dir, setT2Dir)}
          {renderTargetGroup('Target 3', t3Price, setT3Price, t3Dir, setT3Dir)}

          <View style={styles.modalActions}>
            <TouchableOpacity style={[styles.btn, { borderColor: c.red }]} onPress={handleClear}>
              <Text style={[styles.btnText, { color: c.red }]}>Clear All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { borderColor: c.border }]} onPress={onClose}>
              <Text style={[styles.btnText, { color: c.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnPrimary, { backgroundColor: c.accent }]} onPress={handleSave}>
              <Text style={[styles.btnText, { color: '#fff' }]}>Save</Text>
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
  targetGroup: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 10 },
  targetLabel: { fontSize: 12, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  targetRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '600',
  },
  dirBtns: { flexDirection: 'row', gap: 4 },
  dirBtn: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dirBtnText: { fontSize: 16, fontWeight: '700' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  btn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
  btnPrimary: { borderWidth: 0 },
  btnText: { fontSize: 13, fontWeight: '600' },
});
