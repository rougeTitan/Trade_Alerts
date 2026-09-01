import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

export default function UploadModal({ visible, onClose, onImport }) {
  const { theme } = useTheme();
  const c = theme.colors;

  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    const fileData = await Promise.all(
      files.map(async (f) => ({
        name: f.name,
        content: await f.text(),
      }))
    );
    setSelected(fileData);
    setError(null);
  };

  const handleSelect = () => {
    if (Platform.OS === 'web' && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleImport = async () => {
    if (!selected.length) return;
    setLoading(true);
    setError(null);
    try {
      await onImport(selected);
      setSelected([]);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: c.overlay }]}>
        <View style={[styles.modal, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: c.text }]}>Bulk Import</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={c.textSecondary} />
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={[styles.banner, { backgroundColor: c.belowBg, borderColor: c.belowBorder }]}>
              <Text style={[styles.bannerText, { color: c.red }]}>{error}</Text>
            </View>
          ) : null}

          <Text style={[styles.hint, { color: c.textSecondary }]}>
            Select CSV, XLSX, or TradingView TXT files. Filename becomes the sector for TXT.
          </Text>

          {Platform.OS === 'web' && (
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.txt"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          )}

          <TouchableOpacity
            style={[styles.selectBtn, { backgroundColor: c.surface2, borderColor: c.border }]}
            onPress={handleSelect}
          >
            <Ionicons name="document-outline" size={20} color={c.text} />
            <Text style={[styles.selectBtnText, { color: c.text }]}>
              {selected.length ? `${selected.length} file(s) selected` : 'Choose files'}
            </Text>
          </TouchableOpacity>

          {selected.length > 0 && (
            <View style={styles.fileList}>
              {selected.map((f, i) => (
                <Text key={i} style={[styles.fileName, { color: c.textSecondary }]} numberOfLines={1}>
                  {f.name}
                </Text>
              ))}
            </View>
          )}

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, { borderColor: c.border }]} onPress={onClose}>
              <Text style={[styles.btnText, { color: c.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: c.accent }]}
              onPress={handleImport}
              disabled={loading || !selected.length}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={[styles.btnText, { color: '#fff' }]}>Import</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  modal: { width: '100%', maxWidth: 480, borderRadius: 16, borderWidth: 1, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  hint: { fontSize: 13, marginBottom: 16 },
  banner: { padding: 12, borderRadius: 8, marginBottom: 16, borderWidth: 1 },
  bannerText: { fontSize: 13, fontWeight: '600' },
  selectBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, gap: 8 },
  selectBtnText: { fontSize: 14, fontWeight: '600' },
  fileList: { marginTop: 12 },
  fileName: { fontSize: 13, marginBottom: 4 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 20 },
  btn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
  btnText: { fontSize: 13, fontWeight: '700' },
});
