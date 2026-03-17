import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import api from '../services/api';

const SCROLL_SPEED = 50; // pixels per second

export default function TickerRibbon() {
  const { theme } = useTheme();
  const c = theme.colors;
  const [stocks, setStocks] = useState([]);
  const [duration, setDuration] = useState(0);
  const innerRef = useRef(null);

  const loadPrices = useCallback(async () => {
    try {
      const data = await api.getWatchlist();
      const items = [];
      for (const [, list] of Object.entries(data)) {
        for (const s of list) {
          if (s.current_price) {
            items.push({ ticker: s.ticker, price: s.current_price });
          }
        }
      }
      items.sort((a, b) => a.ticker.localeCompare(b.ticker));
      setStocks(items);
    } catch (e) {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    loadPrices();
    const interval = setInterval(loadPrices, 60000);
    return () => clearInterval(interval);
  }, [loadPrices]);

  // Inject CSS keyframes once on web
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (document.getElementById('ticker-ribbon-style')) return;
    const style = document.createElement('style');
    style.id = 'ticker-ribbon-style';
    style.textContent = `
      @keyframes ticker-scroll {
        0% { transform: translateX(0); }
        100% { transform: translateX(-50%); }
      }
      .ticker-ribbon-inner {
        animation: ticker-scroll var(--ticker-duration, 60s) linear infinite;
      }
      .ticker-ribbon-inner:hover {
        animation-play-state: paused;
      }
    `;
    document.head.appendChild(style);
  }, []);

  // Calculate duration based on content width
  const onLayout = useCallback(() => {
    if (Platform.OS === 'web' && innerRef.current) {
      // On web, measure the DOM node directly
      const el = innerRef.current;
      // scrollWidth / 2 gives us one set width
      requestAnimationFrame(() => {
        const halfWidth = el.scrollWidth / 2;
        if (halfWidth > 0) {
          setDuration(halfWidth / SCROLL_SPEED);
        }
      });
    }
  }, []);

  useEffect(() => {
    if (stocks.length > 0) {
      // Small delay to let items render
      const t = setTimeout(onLayout, 100);
      return () => clearTimeout(t);
    }
  }, [stocks, onLayout]);

  if (stocks.length === 0) return null;

  const renderItems = (keyPrefix) =>
    stocks.map((s, i) => (
      <View key={`${keyPrefix}-${s.ticker}-${i}`} style={styles.item}>
        <Text style={[styles.ticker, { color: c.accent }]}>{s.ticker}</Text>
        <Text style={[styles.price, { color: c.text }]}>
          ${s.price.toFixed(2)}
        </Text>
        <Text style={[styles.dot, { color: c.border }]}>•</Text>
      </View>
    ));

  const webStyle =
    Platform.OS === 'web' && duration > 0
      ? { '--ticker-duration': `${duration}s` }
      : {};

  return (
    <View style={[styles.container, { backgroundColor: c.background, borderBottomColor: c.border }]}>
      <View
        ref={innerRef}
        className={Platform.OS === 'web' ? 'ticker-ribbon-inner' : undefined}
        style={[styles.scrollRow, webStyle]}
        onLayout={onLayout}
      >
        {renderItems('a')}
        {renderItems('b')}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 32,
    overflow: 'hidden',
    borderBottomWidth: 1,
  },
  scrollRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  ticker: {
    fontSize: 11,
    fontWeight: '700',
    marginRight: 4,
  },
  price: {
    fontSize: 11,
    fontWeight: '500',
  },
  dot: {
    fontSize: 8,
    marginLeft: 6,
  },
});
