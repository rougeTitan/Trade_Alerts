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
import api from '../services/api';

export default function DocumentUploadModal({ visible, onClose }) {
  const { theme } = useTheme();
  const c = theme.colors;

  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const f = Array.from(e.target.files || [])[0];
    setFile(f || null);
    setError(null);
    setResult(null);
  };

  const handleSelect = () => {
    if (Platform.OS === 'web' && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const contentType = file.type || 'application/octet-stream';
      const { url, key } = await api.getDocumentUploadUrl(file.name, contentType);
      const res = await fetch(url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': contentType },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`S3 upload failed: ${res.status} ${text}`);
      }
      setResult({ key, size: file.size, name: file.name });
      setFile(null);
      fileInputRef.current.value = '';
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: c.overlay }]}>
        <View style={[styles.modal, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: c.text }]}>Document Upload</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={c.textSecondary} />
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={[styles.banner, { backgroundColor: c.belowBg, borderColor: c.belowBorder }]}>
              <Text style={[styles.bannerText, { color: c.red }]}>{error}</Text>
            </View>
          ) : null}

          {result ? (
            <View style={[styles.banner, { backgroundColor: c.aboveBg, borderColor: c.aboveBorder }]}>
              <Text style={[styles.bannerText, { color: c.green }]}>
                Uploaded {result.name} ({formatSize(result.size)})
              </Text>
            </View>
          ) : null}

          <Text style={[styles.hint, { color: c.textSecondary }]}>
            Drop any file of any size and format. It is stored privately in S3.
          </Text>

          {Platform.OS === 'web' && (
            <input
              ref={fileInputRef}
              type="file"
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
              {file ? file.name : 'Choose file'}
            </Text>
          </TouchableOpacity>

          {file && (
            <Text style={[styles.size, { color: c.textSecondary }]}>{formatSize(file.size)}</Text>
          )}

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, { borderColor: c.border }]} onPress={onClose}>
              <Text style={[styles.btnText, { color: c.text }]}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: c.accent }]}
              onPress={handleUpload}
              disabled={loading || !file}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={[styles.btnText, { color: '#fff' }]}>Upload</Text>
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
  size: { fontSize: 12, marginTop: 8, textAlign: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 20 },
  btn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
  btnText: { fontSize: 13, fontWeight: '700' },
});
