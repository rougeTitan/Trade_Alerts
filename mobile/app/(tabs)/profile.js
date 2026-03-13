import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeContext';

export default function ProfileScreen() {
  const { theme, isDark, toggleTheme } = useTheme();
  const c = theme.colors;

  const [emailAlerts, setEmailAlerts] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(false);
  const [pushAlerts, setPushAlerts] = useState(false);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Avatar + Name */}
        <View style={styles.avatarSection}>
          <View style={[styles.avatar, { backgroundColor: c.accent + '20', borderColor: c.accent }]}>
            <Ionicons name="person" size={40} color={c.accent} />
          </View>
          <Text style={[styles.userName, { color: c.text }]}>Trade Alerts User</Text>
          <Text style={[styles.userEmail, { color: c.textSecondary }]}>user@example.com</Text>
          <TouchableOpacity style={[styles.editProfileBtn, { borderColor: c.accent }]}>
            <Ionicons name="create-outline" size={14} color={c.accent} />
            <Text style={[styles.editProfileText, { color: c.accent }]}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Appearance */}
        <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>Appearance</Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name={isDark ? 'moon' : 'sunny'} size={20} color={c.accent} />
              <Text style={[styles.rowLabel, { color: c.text }]}>Dark Mode</Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: c.border, true: c.accent + '50' }}
              thumbColor={isDark ? c.accent : c.textSecondary}
            />
          </View>
        </View>

        {/* Notifications */}
        <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>Notifications</Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={[styles.row, { borderBottomColor: c.border, borderBottomWidth: 1 }]}>
            <View style={styles.rowLeft}>
              <Ionicons name="mail-outline" size={20} color={c.accent} />
              <Text style={[styles.rowLabel, { color: c.text }]}>Email Alerts</Text>
            </View>
            <Switch
              value={emailAlerts}
              onValueChange={setEmailAlerts}
              trackColor={{ false: c.border, true: c.green + '50' }}
              thumbColor={emailAlerts ? c.green : c.textSecondary}
            />
          </View>
          <View style={[styles.row, { borderBottomColor: c.border, borderBottomWidth: 1 }]}>
            <View style={styles.rowLeft}>
              <Ionicons name="chatbox-outline" size={20} color={c.accent} />
              <Text style={[styles.rowLabel, { color: c.text }]}>SMS Alerts</Text>
            </View>
            <Switch
              value={smsAlerts}
              onValueChange={setSmsAlerts}
              trackColor={{ false: c.border, true: c.green + '50' }}
              thumbColor={smsAlerts ? c.green : c.textSecondary}
            />
          </View>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="phone-portrait-outline" size={20} color={c.accent} />
              <Text style={[styles.rowLabel, { color: c.text }]}>Push Notifications</Text>
            </View>
            <Switch
              value={pushAlerts}
              onValueChange={setPushAlerts}
              trackColor={{ false: c.border, true: c.green + '50' }}
              thumbColor={pushAlerts ? c.green : c.textSecondary}
            />
          </View>
        </View>

        {/* About */}
        <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>About</Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={[styles.row, { borderBottomColor: c.border, borderBottomWidth: 1 }]}>
            <View style={styles.rowLeft}>
              <Ionicons name="information-circle-outline" size={20} color={c.accent} />
              <Text style={[styles.rowLabel, { color: c.text }]}>Version</Text>
            </View>
            <Text style={[styles.rowValue, { color: c.textSecondary }]}>1.0.0</Text>
          </View>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="server-outline" size={20} color={c.accent} />
              <Text style={[styles.rowLabel, { color: c.text }]}>API Server</Text>
            </View>
            <Text style={[styles.rowValue, { color: c.textSecondary }]}>localhost:5000</Text>
          </View>
        </View>

        {/* Auth placeholder */}
        <TouchableOpacity style={[styles.logoutBtn, { borderColor: c.red }]}>
          <Ionicons name="log-out-outline" size={18} color={c.red} />
          <Text style={[styles.logoutText, { color: c.red }]}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={[styles.footer, { color: c.textSecondary }]}>
          Authentication coming soon via Amazon Cognito
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {},
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  avatarSection: { alignItems: 'center', paddingVertical: 24, gap: 6 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  userName: { fontSize: 20, fontWeight: '700' },
  userEmail: { fontSize: 13 },
  editProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
  },
  editProfileText: { fontSize: 12, fontWeight: '600' },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    marginTop: 20,
    marginBottom: 8,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowLabel: { fontSize: 14, fontWeight: '500' },
  rowValue: { fontSize: 13 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  logoutText: { fontSize: 14, fontWeight: '600' },
  footer: {
    textAlign: 'center',
    fontSize: 11,
    marginTop: 16,
    paddingHorizontal: 16,
  },
});
