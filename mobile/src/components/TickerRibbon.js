import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import api from '../services/api';

const SCROLL_SPEED = 250; // pixels per second

export default function TickerRibbon() {
  const { theme } = useTheme();
  const c = theme.colors;
  const [stocks, setStocks] = useState([]);
  const innerRef = useRef(null);
  const [ready, setReady] = useState(false);

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
        display: flex;
        flex-direction: row;
        align-items: center;
        height: 32px;
        will-change: transform;
      }
      .ticker-ribbon-inner.scrolling {
        animation: ticker-scroll var(--ticker-duration, 60s) linear infinite;
      }
      .ticker-ribbon-inner:hover {
        animation-play-state: paused;
      }
    `;
    document.head.appendChild(style);
  }, []);

  // Measure and start animation after stocks render
  useEffect(() => {
    if (Platform.OS !== 'web' || stocks.length === 0) return;
    setReady(false);
    const t = setTimeout(() => {
      const el = innerRef.current;
      if (!el) return;
      el.classList.remove('scrolling');
      const halfWidth = el.scrollWidth / 2;
      if (halfWidth > 0) {
        const dur = halfWidth / SCROLL_SPEED;
        el.style.setProperty('--ticker-duration', `${dur}s`);
        // Force reflow before starting animation
        void el.offsetWidth;
        el.classList.add('scrolling');
        setReady(true);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [stocks]);

  if (stocks.length === 0) return null;

  // On web, render raw divs/spans so we get real DOM refs
  if (Platform.OS === 'web') {
    const itemStyle = {
      display: 'flex', flexDirection: 'row', alignItems: 'center',
      paddingLeft: 6, paddingRight: 6, whiteSpace: 'nowrap',
    };
    const tickerStyle = {
      fontSize: 11, fontWeight: '700', color: c.accent, marginRight: 4,
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    };
    const priceStyle = {
      fontSize: 11, fontWeight: '500', color: c.text,
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    };
    const dotStyle = { fontSize: 8, color: c.border, marginLeft: 6 };

    const renderWebItems = (keyPrefix) =>
      stocks.map((s, i) => (
        <span key={`${keyPrefix}-${s.ticker}-${i}`} style={itemStyle}>
          <span style={tickerStyle}>{s.ticker}</span>
          <span style={priceStyle}>${s.price.toFixed(2)}</span>
          <span style={dotStyle}>•</span>
        </span>
      ));

    return (
      <div style={{
        height: 32, overflow: 'hidden', borderBottom: `1px solid ${c.border}`,
        backgroundColor: c.background,
      }}>
        <div ref={innerRef} className="ticker-ribbon-inner">
          {renderWebItems('a')}
          {renderWebItems('b')}
        </div>
      </div>
    );
  }

  // Native fallback (no animation)
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

  return (
    <View style={[styles.container, { backgroundColor: c.background, borderBottomColor: c.border }]}>
      <View style={styles.scrollRow}>
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
