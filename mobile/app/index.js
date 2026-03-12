import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../src/theme/ThemeContext';

const { width } = Dimensions.get('window');

const FEATURES = [
  {
    icon: 'pulse-outline',
    title: 'Real-Time Price Monitoring',
    description: '87+ stocks tracked across 11 sectors with live price updates every 30 seconds during market hours.',
  },
  {
    icon: 'notifications-outline',
    title: 'Instant Alerts',
    description: 'Get email and SMS alerts the moment your price targets are breached — ABOVE, BELOW, or BOTH directions.',
  },
  {
    icon: 'analytics-outline',
    title: '3 Targets Per Stock',
    description: 'Set up to 3 configurable price targets per stock with independent direction triggers.',
  },
  {
    icon: 'time-outline',
    title: 'Market Hours Automation',
    description: 'Runs automatically during US market hours (Mon–Fri, 9:30 AM – 4:00 PM EST). Sleeps outside trading hours.',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Alert Deduplication',
    description: 'Each unique target fires only once per trading day — no alert spam. Resets automatically each morning.',
  },
  {
    icon: 'cloud-outline',
    title: 'Cloud Powered',
    description: 'Deployed on AWS for 24/7 monitoring without keeping your laptop on. Scalable and reliable.',
  },
];

export default function LandingScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={[styles.heroIcon]}>📈</Text>
          <Text style={[styles.heroTitle, { color: c.text }]}>Trade Alerts</Text>
          <Text style={[styles.heroSubtitle, { color: c.textSecondary }]}>
            Stock Price Monitoring & Alert System
          </Text>
          <Text style={[styles.heroDescription, { color: c.textSecondary }]}>
            Track price targets across sectors and get instant notifications when your levels are hit.
          </Text>
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={[styles.ctaButton, { backgroundColor: c.accent }]}
          onPress={() => router.push('/(tabs)/dashboard')}
          activeOpacity={0.8}
        >
          <Text style={styles.ctaText}>Open Dashboard</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Features */}
        <Text style={[styles.sectionTitle, { color: c.text }]}>Features</Text>

        {FEATURES.map((feature, index) => (
          <View key={index} style={[styles.featureCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={[styles.featureIconWrap, { backgroundColor: c.accent + '18' }]}>
              <Ionicons name={feature.icon} size={24} color={c.accent} />
            </View>
            <View style={styles.featureText}>
              <Text style={[styles.featureTitle, { color: c.text }]}>{feature.title}</Text>
              <Text style={[styles.featureDesc, { color: c.textSecondary }]}>{feature.description}</Text>
            </View>
          </View>
        ))}

        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { value: '87+', label: 'Stocks', color: c.accent },
            { value: '11', label: 'Sectors', color: c.green },
            { value: '3', label: 'Targets/Stock', color: c.yellow },
          ].map((stat, i) => (
            <View key={i} style={[styles.statCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: c.textSecondary }]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20 },
  hero: { alignItems: 'center', paddingTop: 40, paddingBottom: 20 },
  heroIcon: { fontSize: 56, marginBottom: 12 },
  heroTitle: { fontSize: 32, fontWeight: '800', marginBottom: 6 },
  heroSubtitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  heroDescription: { fontSize: 14, textAlign: 'center', lineHeight: 21, paddingHorizontal: 20 },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginVertical: 20,
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  sectionTitle: { fontSize: 20, fontWeight: '700', marginBottom: 16, marginTop: 10 },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    gap: 14,
  },
  featureIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: { flex: 1 },
  featureTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  featureDesc: { fontSize: 13, lineHeight: 19 },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  statValue: { fontSize: 26, fontWeight: '800', marginBottom: 2 },
  statLabel: { fontSize: 12, fontWeight: '600' },
});
