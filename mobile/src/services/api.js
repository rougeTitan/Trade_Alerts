// API service layer for Trade Alerts
// Connects to the existing Flask backend

import { Platform } from 'react-native';
import { getIdToken, COGNITO_CONFIGURED } from '../auth/AuthContext';

// Production: set EXPO_PUBLIC_API_URL (e.g. https://alerts.example.com) at build time.
// Dev fallback: localhost; Android emulator uses 10.0.2.2.
const DEFAULT_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || `http://${DEFAULT_HOST}:5001`;
const USER_PREFIX = COGNITO_CONFIGURED ? '/api/v2' : '/api';

class ApiService {
  constructor(baseUrl = BASE_URL) {
    this.baseUrl = baseUrl;
  }

  async _fetch(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const body = options.body && typeof options.body === 'string' ? options.body : '';
    const token = await getIdToken();
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    };
    if (token && token !== 'demo-token') {
      headers['X-Id-Token'] = token;
    }

    // CloudFront OAC + AWS_IAM Lambda function URLs require the payload hash
    // header for every request; otherwise unsigned requests fail with 403.
    if (Platform.OS === 'web' && typeof globalThis !== 'undefined') {
      const gCrypto = globalThis.crypto;
      if (gCrypto && gCrypto.subtle) {
        const encoder = new TextEncoder();
        const digest = await gCrypto.subtle.digest('SHA-256', encoder.encode(body));
        const hash = Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        headers['x-amz-content-sha256'] = hash;
      } else if (!body) {
        headers['x-amz-content-sha256'] =
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      }
    }

    const res = await fetch(url, {
      ...options,
      headers,
    });
    if (!res.ok) {
      const respBody = await res.json().catch(() => ({}));
      throw new Error(respBody.error || `Request failed: ${res.status}`);
    }
    return res.json();
  }

  async bulkImport(fileData) {
    return this._fetch('/api/upload', {
      method: 'POST',
      body: JSON.stringify({ files: fileData }),
    });
  }

  // ── Sectors ──────────────────────────────────────────

  addSector(name) {
    return this._fetch(`${USER_PREFIX}/sectors`, {
      method: 'POST',
      body: JSON.stringify({ sector: name }),
    });
  }

  deleteSector(name) {
    return this._fetch(`${USER_PREFIX}/sectors/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
  }

  // ── Stocks ───────────────────────────────────────────

  addStock(sector, ticker) {
    return this._fetch(`${USER_PREFIX}/stocks`, {
      method: 'POST',
      body: JSON.stringify({ sector, ticker }),
    });
  }

  removeStock(sector, ticker) {
    return this._fetch(
      `${USER_PREFIX}/stocks/${encodeURIComponent(sector)}/${encodeURIComponent(ticker)}`,
      { method: 'DELETE' }
    );
  }

  // ── Watchlist ────────────────────────────────────────

  getWatchlist() {
    return this._fetch(`${USER_PREFIX}/watchlist`);
  }

  // ── Targets ──────────────────────────────────────────

  setTargets(ticker, sector, targets) {
    return this._fetch(`${USER_PREFIX}/targets`, {
      method: 'POST',
      body: JSON.stringify({ ticker, sector, targets }),
    });
  }

  // ── Prices ───────────────────────────────────────────

  refreshPrices() {
    return this._fetch(`${USER_PREFIX}/prices/refresh`);
  }

  // ── Alerts ───────────────────────────────────────────

  getAlerts() {
    return this._fetch(`${USER_PREFIX}/alerts`);
  }

  clearAlerts() {
    return this._fetch(`${USER_PREFIX}/alerts`, { method: 'DELETE' });
  }

  dismissAlert(ticker, direction) {
    return this._fetch(`${USER_PREFIX}/alerts/${encodeURIComponent(ticker)}/${encodeURIComponent(direction)}`, {
      method: 'DELETE',
    });
  }

  // ── Monitor ──────────────────────────────────────────

  getMonitorStatus() {
    return this._fetch('/api/monitor/status');
  }

  startMonitor() {
    return this._fetch('/api/monitor/start', { method: 'POST', body: '{}' });
  }

  stopMonitor() {
    return this._fetch('/api/monitor/stop', { method: 'POST', body: '{}' });
  }

  checkOnce() {
    return this._fetch('/api/check-once', { method: 'POST', body: '{}' });
  }
}

export const api = new ApiService();
export default api;
