import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import AnimatedToggle from '../../src/components/AnimatedToggle';

const TABS = [
  { key: 'payment', label: 'Payment', icon: 'card-outline' },
  { key: 'security', label: 'Security', icon: 'shield-checkmark-outline' },
  { key: 'notifications', label: 'Alerts', icon: 'notifications-outline' },
];

const BRAND_COLORS = {
  VISA: '#1a1f71',
  MC: '#eb001b',
};

const INITIAL_CARDS = [
  { id: 'c1', brand: 'VISA', last4: '4242', exp: '08/27', default: true },
  { id: 'c2', brand: 'MC', last4: '5555', exp: '11/26', default: false },
];

const BILLING = [
  { id: 'b1', date: 'Jun 01, 2026', amount: '$29.00', status: 'Paid' },
  { id: 'b2', date: 'May 01, 2026', amount: '$29.00', status: 'Paid' },
  { id: 'b3', date: 'Apr 01, 2026', amount: '$29.00', status: 'Paid' },
];

const INITIAL_SESSIONS = [
  { id: 's1', device: 'Chrome · Windows', location: 'New York, US', current: true },
  { id: 's2', device: 'Expo Go · Android', location: 'Boston, US', current: false },
  { id: 's3', device: 'Safari · macOS', location: 'Austin, US', current: false },
];

function SectionTitle({ children, color }) {
  return <Text style={[styles.sectionTitle, { color }]}>{children}</Text>;
}

function PaymentTab({ c }) {
  const [cards, setCards] = useState(INITIAL_CARDS);

  const addCard = () => {
    const brands = ['VISA', 'MC'];
    const brand = brands[Math.floor(Math.random() * brands.length)];
    const last4 = String(Math.floor(1000 + Math.random() * 9000));
    setCards((prev) => [
      ...prev,
      { id: `c${Date.now()}`, brand, last4, exp: '01/29', default: false },
    ]);
  };

  const makeDefault = (id) => {
    setCards((prev) => prev.map((card) => ({ ...card, default: card.id === id })));
  };

  return (
    <View>
      <SectionTitle color={c.textSecondary}>Payment Methods</SectionTitle>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        {cards.map((card, i) => (
          <TouchableOpacity
            key={card.id}
            activeOpacity={0.7}
            onPress={() => makeDefault(card.id)}
            style={[styles.row, i < cards.length - 1 && { borderBottomColor: c.border, borderBottomWidth: 1 }]}
          >
            <View style={styles.rowLeft}>
              <View style={[styles.brandBadge, { backgroundColor: BRAND_COLORS[card.brand] }]}>
                <Text style={styles.brandText}>{card.brand}</Text>
              </View>
              <View>
                <Text style={[styles.rowLabel, { color: c.text }]}>•••• {card.last4}</Text>
                <Text style={[styles.rowSub, { color: c.textSecondary }]}>Expires {card.exp}</Text>
              </View>
            </View>
            {card.default && (
              <View style={[styles.pill, { backgroundColor: c.accent + '20', borderColor: c.accent + '40' }]}>
                <Text style={[styles.pillText, { color: c.accent }]}>Default</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        onPress={addCard}
        style={[styles.dashedBtn, { borderColor: c.border }]}
        activeOpacity={0.7}
      >
        <Ionicons name="add" size={18} color={c.accent} />
        <Text style={[styles.dashedText, { color: c.accent }]}>Add Card</Text>
      </TouchableOpacity>

      <SectionTitle color={c.textSecondary}>Billing History</SectionTitle>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={[styles.tableHead, { borderBottomColor: c.border }]}>
          <Text style={[styles.thDate, { color: c.textSecondary }]}>Date</Text>
          <Text style={[styles.thAmount, { color: c.textSecondary }]}>Amount</Text>
          <Text style={[styles.thStatus, { color: c.textSecondary }]}>Status</Text>
          <View style={styles.thDownload} />
        </View>
        {BILLING.map((row, i) => (
          <View
            key={row.id}
            style={[styles.tableRow, i < BILLING.length - 1 && { borderBottomColor: c.border, borderBottomWidth: 1 }]}
          >
            <Text style={[styles.thDate, styles.cellText, { color: c.text }]}>{row.date}</Text>
            <Text style={[styles.thAmount, styles.cellText, { color: c.text }]}>{row.amount}</Text>
            <View style={styles.thStatus}>
              <View style={[styles.statusDot, { backgroundColor: c.green }]} />
              <Text style={[styles.statusText, { color: c.green }]}>{row.status}</Text>
            </View>
            <View style={styles.thDownload} />
          </View>
        ))}
      </View>
    </View>
  );
}

function SecurityTab({ c, onSignOutAll }) {
  const [sessions, setSessions] = useState(INITIAL_SESSIONS);

  const revoke = (id) => setSessions((prev) => prev.filter((s) => s.id !== id));

  return (
    <View>
      <SectionTitle color={c.textSecondary}>Password</SectionTitle>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="lock-closed-outline" size={20} color={c.accent} />
            <View>
              <Text style={[styles.rowLabel, { color: c.text }]}>Password</Text>
              <Text style={[styles.rowSub, { color: c.textSecondary }]}>Last changed 3 months ago</Text>
            </View>
          </View>
        </View>
      </View>

      <SectionTitle color={c.textSecondary}>Two-Factor Auth</SectionTitle>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="shield-checkmark-outline" size={20} color={c.green} />
            <View>
              <Text style={[styles.rowLabel, { color: c.text }]}>Authenticator App</Text>
              <Text style={[styles.rowSub, { color: c.textSecondary }]}>Extra layer of protection</Text>
            </View>
          </View>
          <View style={[styles.pill, { backgroundColor: c.green + '20', borderColor: c.green + '40' }]}>
            <Text style={[styles.pillText, { color: c.green }]}>Enabled</Text>
          </View>
        </View>
      </View>

      <SectionTitle color={c.textSecondary}>Active Sessions</SectionTitle>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        {sessions.map((s, i) => (
          <View
            key={s.id}
            style={[styles.row, i < sessions.length - 1 && { borderBottomColor: c.border, borderBottomWidth: 1 }]}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="desktop-outline" size={20} color={c.textSecondary} />
              <View>
                <Text style={[styles.rowLabel, { color: c.text }]}>{s.device}</Text>
                <Text style={[styles.rowSub, { color: c.textSecondary }]}>{s.location}</Text>
              </View>
            </View>
            {s.current ? (
              <View style={[styles.pill, { backgroundColor: c.accent + '20', borderColor: c.accent + '40' }]}>
                <Text style={[styles.pillText, { color: c.accent }]}>Current</Text>
              </View>
            ) : (
              <TouchableOpacity onPress={() => revoke(s.id)} style={[styles.smallBtn, { borderColor: c.red }]}>
                <Text style={[styles.smallBtnText, { color: c.red }]}>Revoke</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>

      <TouchableOpacity
        onPress={() => setSessions((prev) => prev.filter((s) => s.current))}
        style={[styles.logoutBtn, { borderColor: c.red }]}
      >
        <Ionicons name="log-out-outline" size={18} color={c.red} />
        <Text style={[styles.logoutText, { color: c.red }]}>Sign Out All Sessions</Text>
      </TouchableOpacity>
    </View>
  );
}

function NotificationsTab({ c, isDark, toggleTheme }) {
  const [toggles, setToggles] = useState({
    email: true,
    push: false,
    sms: false,
    marketing: false,
  });

  const set = (key) => (val) => setToggles((prev) => ({ ...prev, [key]: val }));

  const rows = [
    { key: 'email', label: 'Email', icon: 'mail-outline' },
    { key: 'push', label: 'Push', icon: 'phone-portrait-outline' },
    { key: 'sms', label: 'SMS', icon: 'chatbox-outline' },
    { key: 'marketing', label: 'Marketing', icon: 'megaphone-outline' },
  ];

  return (
    <View>
      <SectionTitle color={c.textSecondary}>Notification Channels</SectionTitle>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        {rows.map((row, i) => (
          <View
            key={row.key}
            style={[styles.row, i < rows.length - 1 && { borderBottomColor: c.border, borderBottomWidth: 1 }]}
          >
            <View style={styles.rowLeft}>
              <Ionicons name={row.icon} size={20} color={c.accent} />
              <Text style={[styles.rowLabel, { color: c.text }]}>{row.label}</Text>
            </View>
            <AnimatedToggle value={toggles[row.key]} onValueChange={set(row.key)} />
          </View>
        ))}
      </View>

      <SectionTitle color={c.textSecondary}>Appearance</SectionTitle>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name={isDark ? 'moon' : 'sunny'} size={20} color={c.accent} />
            <Text style={[styles.rowLabel, { color: c.text }]}>Dark Mode</Text>
          </View>
          <AnimatedToggle value={isDark} onValueChange={toggleTheme} activeColor={c.accent} />
        </View>
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const { theme, isDark, toggleTheme } = useTheme();
  const c = theme.colors;
  const { user, isAuthenticated, login, logout } = useAuth();

  const [activeTab, setActiveTab] = useState('payment');

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Avatar + Name */}
        <View style={styles.avatarSection}>
          {user?.avatar ? (
            <Image source={{ uri: user.avatar }} style={[styles.avatarImg, { borderColor: c.accent }]} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: c.accent + '20', borderColor: c.accent }]}>
              <Ionicons name="person" size={40} color={c.accent} />
            </View>
          )}
          <Text style={[styles.userName, { color: c.text }]}>
            {user?.name || 'Guest'}
          </Text>
          <Text style={[styles.userEmail, { color: c.textSecondary }]}>
            {user?.email || 'Not signed in'}
          </Text>
          {!isAuthenticated && (
            <TouchableOpacity onPress={() => login()} style={[styles.editProfileBtn, { backgroundColor: c.accent, borderColor: c.accent }]}>
              <Ionicons name="log-in-outline" size={14} color="#fff" />
              <Text style={[styles.editProfileText, { color: '#fff' }]}>Sign In (Demo)</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tab bar */}
        <View style={[styles.tabBar, { backgroundColor: c.surface, borderColor: c.border }]}>
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.tab, active && { backgroundColor: c.accent }]}
                activeOpacity={0.8}
              >
                <Ionicons name={tab.icon} size={15} color={active ? '#fff' : c.textSecondary} />
                <Text style={[styles.tabText, { color: active ? '#fff' : c.textSecondary }]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Tab content */}
        <View style={styles.tabContent}>
          {activeTab === 'payment' && <PaymentTab c={c} />}
          {activeTab === 'security' && <SecurityTab c={c} />}
          {activeTab === 'notifications' && (
            <NotificationsTab c={c} isDark={isDark} toggleTheme={toggleTheme} />
          )}
        </View>

        {/* Sign out */}
        {isAuthenticated && (
          <TouchableOpacity onPress={logout} style={[styles.logoutBtn, { borderColor: c.red }]}>
            <Ionicons name="log-out-outline" size={18} color={c.red} />
            <Text style={[styles.logoutText, { color: c.red }]}>Sign Out</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {},
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
  avatarImg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
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

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 4,
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 9,
  },
  tabText: { fontSize: 12, fontWeight: '700' },
  tabContent: { minHeight: 200 },

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
  rowSub: { fontSize: 11, marginTop: 2 },

  // Badges / pills
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  pillText: { fontSize: 11, fontWeight: '700' },
  brandBadge: {
    width: 42,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  // Small button
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  smallBtnText: { fontSize: 12, fontWeight: '700' },

  // Add card dashed
  dashedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  dashedText: { fontSize: 13, fontWeight: '700' },

  // Billing table
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  thDate: { flex: 2, fontSize: 11, fontWeight: '600' },
  thAmount: { flex: 1.2, fontSize: 11, fontWeight: '600' },
  thStatus: { flex: 1.3, flexDirection: 'row', alignItems: 'center', gap: 5 },
  thDownload: { width: 28, alignItems: 'flex-end' },
  cellText: { fontWeight: '500', fontSize: 12 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '600' },

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
});
