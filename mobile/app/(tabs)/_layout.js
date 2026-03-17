import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/ThemeContext';
import TickerRibbon from '../../src/components/TickerRibbon';
import api from '../../src/services/api';

const NAV_ITEMS = [
  { name: 'dashboard', label: 'Dashboard', icon: 'grid-outline' },
  { name: 'alerts', label: 'Alerts', icon: 'notifications-outline' },
  { name: 'profile', label: 'Profile', icon: 'person-outline' },
];

function TopNavBar({ navigation }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const state = navigation.getState();
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    api.getAlerts().then((alerts) => setAlertCount(alerts.length)).catch(() => {});
  }, []);

  return (
    <View>
      <View
        style={[
          styles.navbar,
          {
            backgroundColor: c.surface,
            borderBottomColor: c.border,
            paddingTop: insets.top + 6,
          },
        ]}
      >
        <Text style={[styles.brand, { color: c.accent }]}>Trade Alerts</Text>
        <View style={styles.navLinks}>
          {NAV_ITEMS.map((item, index) => {
            const isActive = state.index === index;
            return (
              <TouchableOpacity
                key={item.name}
                onPress={() => navigation.navigate(item.name)}
                style={[
                  styles.navLink,
                  isActive && { borderBottomColor: c.accent, borderBottomWidth: 2 },
                ]}
              >
                <Ionicons
                  name={item.icon}
                  size={15}
                  color={isActive ? c.accent : c.textSecondary}
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={[
                    styles.navLinkText,
                    { color: isActive ? c.accent : c.textSecondary },
                  ]}
                >
                  {item.label}
                </Text>
                {item.name === 'alerts' && alertCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{alertCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <TickerRibbon />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        header: ({ navigation }) => <TopNavBar navigation={navigation} />,
        tabBarStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="alerts" options={{ title: 'Alerts' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  brand: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  navLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  navLink: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  navLinkText: {
    fontSize: 13,
    fontWeight: '600',
  },
  badge: {
    backgroundColor: '#c00',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
});
