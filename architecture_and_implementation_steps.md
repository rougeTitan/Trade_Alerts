# 📐 Architecture & Implementation Steps — Trade Alerts

## Table of Contents

- [1. Cloud-Native Architecture on AWS](#1-cloud-native-architecture-on-aws)
- [2. AWS Services Breakdown](#2-aws-services-breakdown)
- [3. Migration Phases](#3-migration-phases)
- [4. User Authentication — Amazon Cognito](#4-user-authentication--amazon-cognito)
- [5. Dark / Light Theme](#5-dark--light-theme)
- [6. Stock Chart Preview](#6-stock-chart-preview)
- [7. Stock News (3 Latest)](#7-stock-news-3-latest)
- [8. Mobile App (Android + iOS)](#8-mobile-app-android--ios)
- [9. Final Technology Stack](#9-final-technology-stack)
- [10. Estimated AWS Cost](#10-estimated-aws-cost)

---

## 1. Cloud-Native Architecture on AWS

The current app is a single-process Flask server with Excel files and background threads. To make it production-grade and scalable, the following target architecture is proposed:

```
                        ┌──────────────────┐
                        │   Route 53 (DNS) │
                        └────────┬─────────┘
                                 │
                        ┌────────▼─────────┐
                        │  CloudFront CDN   │  ← Static assets (React frontend)
                        └────────┬─────────┘
                                 │
                        ┌────────▼─────────┐
                        │  API Gateway      │  ← REST API + WebSocket (live prices)
                        └────────┬─────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                   │
    ┌─────────▼───────┐  ┌──────▼──────┐  ┌────────▼────────┐
    │  ECS Fargate     │  │  Lambda     │  │  Lambda          │
    │  (Price Monitor) │  │  (API CRUD) │  │  (News Fetcher)  │
    └─────────┬───────┘  └──────┬──────┘  └────────┬────────┘
              │                  │                   │
              └──────────────────┼──────────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                   │
    ┌─────────▼───────┐  ┌──────▼──────┐  ┌────────▼────────┐
    │  DynamoDB        │  │  S3          │  │  SNS / SES       │
    │  (Users, Alerts, │  │  (Profile    │  │  (Email/SMS      │
    │   Watchlists)    │  │   Pictures)  │  │   Notifications) │
    └─────────────────┘  └─────────────┘  └─────────────────┘
```

---

## 2. AWS Services Breakdown

| Service | Purpose | Why |
|---|---|---|
| **ECS Fargate** | Run the price-monitoring engine | Long-running task, auto-scales, no server management |
| **Lambda** | API endpoints (CRUD, news fetch) | Pay-per-request, scales to zero, cheap |
| **API Gateway** | REST API + auth integration | Routes requests, throttling, CORS |
| **DynamoDB** | Store users, watchlists, alerts, targets | Replace Excel files, serverless, scales automatically |
| **S3** | Profile pictures, static frontend hosting | Cheap storage, CDN-ready |
| **CloudFront** | CDN for frontend + API caching | Low latency globally |
| **SNS + SES** | Push notifications, email alerts | Replace Gmail SMTP + Twilio (cheaper, native) |
| **EventBridge** | Schedule price checks | Replace Python `schedule` library |
| **CloudWatch** | Logging, monitoring, alarms | Operational visibility |
| **Cognito** | User sign-up, login, profile management | Managed auth, free tier up to 50K users |
| **Route 53** | DNS management | Custom domain, health checks |

---

## 3. Migration Phases

### Phase 1 — Database & Containerization

**Goal:** Replace Excel files with DynamoDB, deploy Flask on ECS Fargate.

**Steps:**

1. **Design DynamoDB tables:**
   - `Users` — partition key: `userId`
   - `Watchlists` — partition key: `userId`, sort key: `sector#ticker`
   - `Alerts` — partition key: `userId`, sort key: `timestamp`
   - `PriceCache` — partition key: `ticker`, TTL for auto-expiry

2. **Refactor data layer:**
   - Replace `excel_manager.py` reads/writes with DynamoDB calls using `boto3`
   - Replace `alert_log.csv` with DynamoDB `Alerts` table
   - Replace `sectors.json` with DynamoDB or keep as S3 object

3. **Containerize the app:**
   - Create a `Dockerfile` for the Flask app + monitor
   - Push image to Amazon ECR (Elastic Container Registry)

4. **Deploy to ECS Fargate:**
   - Create ECS cluster, task definition, service
   - Configure Application Load Balancer (ALB) in front
   - Set up CloudWatch log groups

**Estimated effort:** 2–3 weeks

---

### Phase 2 — Authentication & Profile Management

**Goal:** Add Cognito-based auth, user profiles, and S3 profile pictures.

**Steps:**

1. **Create Cognito User Pool:**
   - Configure sign-up (email + password)
   - Enable email verification
   - Add custom attributes: `theme_preference`, `notification_preferences`
   - Optional: enable social login (Google, Apple)

2. **Integrate Cognito with API Gateway:**
   - Attach Cognito authorizer to protected endpoints
   - Public endpoints: landing page, features page
   - Protected endpoints: watchlist CRUD, alerts, profile

3. **Build profile management:**
   - Edit name, email, notification preferences
   - Profile picture upload flow (see Section 4 for details)

4. **Implement gated access in frontend:**
   - Landing page → features page (public)
   - "Set alert" or "Add stock" → prompt login/signup
   - After login → full dashboard access

**Estimated effort:** 1–2 weeks

---

### Phase 3 — Serverless API Migration

**Goal:** Move API from Flask/ECS to Lambda + API Gateway for cost efficiency.

**Steps:**

1. **Refactor Flask routes into Lambda handlers:**
   - Each route group → one Lambda function (or use a single Lambda with routing)
   - Use `aws-lambda-powertools` for structured logging, validation, tracing

2. **Set up API Gateway:**
   - REST API with resource paths matching current Flask routes
   - Attach Cognito authorizer
   - Enable CORS
   - Configure throttling (rate limiting)

3. **Keep price monitor on ECS Fargate:**
   - The monitor is a long-running process, not suitable for Lambda (15-min timeout)
   - Alternatively: use EventBridge to trigger Lambda every 30 seconds (market hours only)

4. **Set up CloudFront:**
   - Origin 1: S3 bucket (React frontend static files)
   - Origin 2: API Gateway (API requests via `/api/*` path)

**Estimated effort:** 1–2 weeks

---

### Phase 4 — Frontend Rebuild (React)

**Goal:** Modern React frontend with charts, news, and theming.

**Steps:**

1. **Scaffold React app:**
   - Vite + React + TailwindCSS
   - Set up routing (React Router): `/`, `/dashboard`, `/profile`, `/login`

2. **Implement features:**
   - Landing/features page (public)
   - Login/signup pages (Cognito integration via `@aws-amplify/auth`)
   - Dashboard with sector sidebar, stock table, alerts
   - Profile page with circular avatar, edit form
   - Dark/light theme toggle (see Section 5)
   - Chart sparklines + modal (see Section 6)
   - News section per stock (see Section 7)

3. **Deploy frontend:**
   - Build → upload to S3
   - Serve via CloudFront with custom domain (Route 53)

4. **CI/CD:**
   - GitHub Actions: on push to `main` → build React → sync to S3 → invalidate CloudFront cache

**Estimated effort:** 2–3 weeks

---

### Phase 5 — Mobile App

**Goal:** Android + iOS apps sharing the same backend.

**Steps:**

1. Start with PWA (Progressive Web App) for quick distribution
2. Build React Native (Expo) app for native experience
3. Add push notifications via AWS SNS (APNs + FCM)

**Estimated effort:** 3–4 weeks

---

## 4. User Authentication — Amazon Cognito

### Why NOT AWS IAM?

**AWS IAM is for managing AWS resource access** (developers, services, CI/CD pipelines). It is **not designed for application end-users**. Using IAM for user login would be a security anti-pattern and an operational nightmare.

**Amazon Cognito** is the correct AWS service for application user management.

### What Cognito Provides

| Feature | Details |
|---|---|
| **Sign up / Sign in** | Email + password, social login (Google, Apple, Facebook) |
| **Profile management** | Built-in user attributes (name, email, picture, custom fields) |
| **MFA** | SMS or TOTP-based multi-factor authentication |
| **JWT tokens** | Access / ID / Refresh tokens for API authorization |
| **Hosted UI** | Pre-built login pages (or build your own) |
| **API Gateway integration** | Native — just attach a Cognito authorizer to endpoints |
| **Free tier** | 50,000 monthly active users free |

### Authentication Flow

```
Frontend (React)                    Backend (API Gateway + Lambda)
     │                                        │
     │  1. User signs up / logs in            │
     │──────────► Cognito User Pool ──────────│
     │  2. Gets JWT tokens                    │
     │                                        │
     │  3. Calls API with JWT in header       │
     │────────────────────────────────────────►│
     │                                        │  4. API Gateway validates JWT
     │                                        │     with Cognito authorizer
     │                                        │  5. Lambda processes request
```

### Profile Picture Flow

1. User selects image → frontend requests a presigned S3 upload URL from the API
2. API (Lambda) generates a presigned S3 PUT URL scoped to the user's folder
3. Frontend uploads the image directly to S3 using the presigned URL
4. Profile picture URL is stored in Cognito user attribute or DynamoDB
5. Frontend displays the circular avatar using the S3 URL via CloudFront

### Cognito Setup Steps

```bash
# Using AWS CLI

# 1. Create User Pool
aws cognito-idp create-user-pool \
  --pool-name TradeAlertsUsers \
  --auto-verified-attributes email \
  --username-attributes email \
  --schema Name=email,Required=true Name=name,Required=true \
  --policies '{"PasswordPolicy":{"MinimumLength":8,"RequireUppercase":true,"RequireLowercase":true,"RequireNumbers":true,"RequireSymbols":false}}'

# 2. Create App Client (for React frontend)
aws cognito-idp create-user-pool-client \
  --user-pool-id <pool-id> \
  --client-name TradeAlertsWebApp \
  --no-generate-secret \
  --explicit-auth-flows ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --supported-identity-providers COGNITO

# 3. Create User Pool Domain (for hosted UI, optional)
aws cognito-idp create-user-pool-domain \
  --user-pool-id <pool-id> \
  --domain trade-alerts-auth
```

### Frontend Integration (React + Amplify)

```bash
npm install @aws-amplify/auth @aws-amplify/core
```

```javascript
// src/config/amplify.js
import { Amplify } from '@aws-amplify/core';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: 'us-east-1_XXXXXXXXX',
      userPoolClientId: 'xxxxxxxxxxxxxxxxxxxxxxxxxx',
      loginWith: {
        email: true,
      },
    },
  },
});
```

```javascript
// src/hooks/useAuth.js
import { signUp, signIn, signOut, getCurrentUser, fetchUserAttributes } from '@aws-amplify/auth';

export function useAuth() {
  const login = async (email, password) => {
    return await signIn({ username: email, password });
  };

  const register = async (email, password, name) => {
    return await signUp({
      username: email,
      password,
      options: { userAttributes: { name } },
    });
  };

  const logout = async () => {
    return await signOut();
  };

  const getUser = async () => {
    const user = await getCurrentUser();
    const attributes = await fetchUserAttributes();
    return { ...user, ...attributes };
  };

  return { login, register, logout, getUser };
}
```

---

## 5. Dark / Light Theme

### Implementation

Use CSS custom properties with a React context for theme state:

```javascript
// src/context/ThemeContext.jsx
import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

const themes = {
  dark: {
    '--bg-primary': '#0f1117',
    '--bg-secondary': '#1a1d27',
    '--bg-card': '#1e2130',
    '--text-primary': '#e2e8f0',
    '--text-secondary': '#94a3b8',
    '--border': '#2d3148',
    '--accent': '#4f8ff7',
    '--up': '#22c55e',
    '--down': '#ef4444',
  },
  light: {
    '--bg-primary': '#ffffff',
    '--bg-secondary': '#f7f8fa',
    '--bg-card': '#ffffff',
    '--text-primary': '#1a202c',
    '--text-secondary': '#64748b',
    '--border': '#e2e8f0',
    '--accent': '#2563eb',
    '--up': '#16a34a',
    '--down': '#dc2626',
  },
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    const vars = themes[theme];
    Object.entries(vars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
```

### Theme Toggle Component

```javascript
// src/components/ThemeToggle.jsx
import { useTheme } from '../context/ThemeContext';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button onClick={toggleTheme} aria-label="Toggle theme">
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
```

### Syncing Across Devices

- Store theme preference in `localStorage` for instant access
- Also save it as a Cognito custom attribute or DynamoDB user record
- On login, sync from server → override local preference

---

## 6. Stock Chart Preview

### Approach

| Component | Tool |
|---|---|
| **Sparkline in table row** | [Lightweight Charts](https://github.com/nicehash/lightweight-charts) by TradingView (35KB, free, open-source) |
| **Full chart modal** | Same library — candlestick/line chart with volume and time range selector |
| **Data source** | Yahoo Finance via yfinance — fetch 1-month daily data for sparkline, 1-year for modal |

### Architecture

```
User clicks sparkline → Modal opens
     │
     │  GET /api/chart/{ticker}?range=1y
     ▼
API Gateway → Lambda
     │
     │  1. Check DynamoDB cache (TTL: 1 hour)
     │  2. If miss → fetch from Yahoo Finance
     │  3. Store in cache → return data
     ▼
Frontend renders Lightweight Charts
```

### Sparkline Component (React)

```javascript
// src/components/Sparkline.jsx
import { useEffect, useRef } from 'react';
import { createChart } from 'lightweight-charts';

export function Sparkline({ data, width = 120, height = 40, color = '#4f8ff7' }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !data?.length) return;

    const chart = createChart(containerRef.current, {
      width,
      height,
      layout: { background: { type: 'solid', color: 'transparent' } },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      crosshair: { mode: 0 },
      rightPriceScale: { visible: false },
      timeScale: { visible: false },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addAreaSeries({
      lineColor: color,
      topColor: color + '40',
      bottomColor: color + '00',
      lineWidth: 1.5,
    });

    series.setData(data);
    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [data, width, height, color]);

  return <div ref={containerRef} style={{ cursor: 'pointer' }} />;
}
```

### Chart Modal Component

```javascript
// src/components/ChartModal.jsx
import { useEffect, useRef, useState } from 'react';
import { createChart } from 'lightweight-charts';

export function ChartModal({ ticker, isOpen, onClose }) {
  const containerRef = useRef(null);
  const [range, setRange] = useState('1y');
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!isOpen || !ticker) return;
    fetch(`/api/chart/${ticker}?range=${range}`)
      .then((res) => res.json())
      .then(setData);
  }, [ticker, isOpen, range]);

  useEffect(() => {
    if (!containerRef.current || !data) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { type: 'solid', color: 'var(--bg-card)' },
        textColor: 'var(--text-primary)',
      },
    });

    const candlestickSeries = chart.addCandlestickSeries();
    candlestickSeries.setData(data.candles);

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    volumeSeries.setData(data.volume);

    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [data]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{ticker}</h2>
          <div className="range-buttons">
            {['1d', '1w', '1m', '3m', '1y'].map((r) => (
              <button
                key={r}
                className={range === r ? 'active' : ''}
                onClick={() => setRange(r)}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>
          <button onClick={onClose}>✕</button>
        </div>
        <div ref={containerRef} />
      </div>
    </div>
  );
}
```

---

## 7. Stock News (3 Latest)

### Data Source Options

| Source | Cost | Quality |
|---|---|---|
| **Yahoo Finance RSS** | Free | Good — general news, already compatible with yfinance |
| **Finnhub API** | Free tier: 60 calls/min | Very good — company news with sentiment |
| **Alpha Vantage News** | Free tier: 25 calls/day | Good — news with relevance scores |
| **NewsAPI.org** | Free tier: 100 calls/day | Broad — needs filtering |

**Recommended: Finnhub** — best free tier for stock-specific news.

### API Example

```
GET https://finnhub.io/api/v1/company-news?symbol=AAPL&from=2026-03-01&to=2026-03-09&token=YOUR_API_KEY
```

**Response:**
```json
[
  {
    "headline": "Apple Unveils New AI Features at Spring Event",
    "source": "Reuters",
    "datetime": 1741500000,
    "url": "https://...",
    "summary": "Apple announced...",
    "image": "https://..."
  }
]
```

### Architecture

```
User views stock detail
     │
     │  GET /api/news/{ticker}
     ▼
API Gateway → Lambda
     │
     │  1. Check DynamoDB cache (TTL: 30 minutes)
     │  2. If miss → fetch from Finnhub API
     │  3. Take top 3 by relevance/date
     │  4. Cache → return to frontend
     ▼
Frontend renders news cards
```

### News Component (React)

```javascript
// src/components/StockNews.jsx
import { useEffect, useState } from 'react';

export function StockNews({ ticker }) {
  const [news, setNews] = useState([]);

  useEffect(() => {
    fetch(`/api/news/${ticker}`)
      .then((res) => res.json())
      .then((data) => setNews(data.slice(0, 3)));
  }, [ticker]);

  if (!news.length) return null;

  return (
    <div className="stock-news">
      <h4>Latest News</h4>
      {news.map((item, i) => (
        <a key={i} href={item.url} target="_blank" rel="noopener noreferrer" className="news-card">
          {item.image && <img src={item.image} alt="" className="news-thumb" />}
          <div>
            <p className="news-headline">{item.headline}</p>
            <span className="news-meta">
              {item.source} · {new Date(item.datetime * 1000).toLocaleDateString()}
            </span>
          </div>
        </a>
      ))}
    </div>
  );
}
```

---

## 8. Mobile App (Android + iOS)

### Options Comparison

| Approach | Pros | Cons | Recommended? |
|---|---|---|---|
| **React Native / Expo** | One codebase → iOS + Android + Web, huge ecosystem, hot reload | Slight performance gap vs fully native | **Yes — best fit** |
| **Flutter** | Beautiful UI, fast, single codebase | Dart language (learning curve), smaller ecosystem | Good alternative |
| **PWA** | Zero app store needed, works immediately, minimal effort | Limited push notifications on iOS, not "native" feel | **Quick win for v1** |
| **Native (Swift + Kotlin)** | Best performance, full platform access | Two codebases, 2× effort | Overkill for this app |

### Recommended Path

**Step 1 — PWA (immediate, minimal effort):**

Add a `manifest.json` and a service worker to the existing web app. Users can "install" it directly from the browser on both Android and iOS.

```json
// public/manifest.json
{
  "name": "Trade Alerts",
  "short_name": "TradeAlerts",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f1117",
  "theme_color": "#4f8ff7",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**Step 2 — React Native with Expo (medium-term):**

Since the frontend will be built in React, most UI logic and components can be shared. Expo provides:
- Managed build pipeline (no Xcode/Android Studio required initially)
- Over-the-air updates
- Push notification support (via Expo Notifications → AWS SNS)

```bash
npx create-expo-app TradeAlertsMobile
cd TradeAlertsMobile
npx expo install expo-notifications expo-secure-store
```

**Step 3 — Push Notifications:**

- Use **AWS SNS** for push notifications to both platforms:
  - iOS → Apple Push Notification Service (APNs)
  - Android → Firebase Cloud Messaging (FCM)
- When a price alert fires, Lambda publishes to SNS topic → SNS delivers to mobile devices
- Users can choose: email, SMS, push notification, or any combination

### Mobile App Architecture

```
┌─────────────────────────────┐
│  React Native (Expo) App    │
│  ┌───────────────────────┐  │
│  │  Auth (Cognito)       │  │
│  │  Dashboard            │  │
│  │  Charts               │  │
│  │  News                 │  │
│  │  Profile              │  │
│  │  Push Notifications   │  │
│  └───────────────────────┘  │
└──────────────┬──────────────┘
               │ HTTPS (same API)
               ▼
┌─────────────────────────────┐
│  API Gateway + Lambda       │  ← Same backend as web app
│  DynamoDB + S3 + Cognito    │     No changes needed
└─────────────────────────────┘
```

---

## 9. Final Technology Stack

| Layer | Technology |
|---|---|
| **Frontend (Web)** | React + Vite + TailwindCSS |
| **Frontend (Mobile)** | React Native (Expo) |
| **Auth** | Amazon Cognito |
| **API** | API Gateway + Lambda (Python) |
| **Database** | DynamoDB |
| **File Storage** | S3 (profile pictures, static assets) |
| **Price Engine** | ECS Fargate (containerized monitor) |
| **Notifications** | SES (email) + SNS (SMS + push) |
| **Charts** | Lightweight Charts (TradingView) |
| **News** | Finnhub API |
| **CDN** | CloudFront |
| **DNS** | Route 53 |
| **CI/CD** | GitHub Actions → ECR / S3 deploy |
| **Infrastructure as Code** | AWS CDK (Python) or Terraform |

---

## 10. Estimated AWS Cost

### Low Traffic (< 1,000 Users)

| Service | Monthly Cost |
|---|---|
| Cognito | Free (under 50K MAU) |
| Lambda | Free (under 1M requests) |
| API Gateway | ~$1–3 |
| DynamoDB | ~$1–5 (on-demand mode) |
| ECS Fargate (1 task, market hours only) | ~$5–10 |
| S3 | < $1 |
| SES | $0.10 per 1,000 emails |
| CloudFront | < $1 |
| **Total** | **~$10–20 / month** |

### Medium Traffic (1,000–10,000 Users)

| Service | Monthly Cost |
|---|---|
| Cognito | Free |
| Lambda | ~$5–15 |
| API Gateway | ~$10–30 |
| DynamoDB | ~$10–30 |
| ECS Fargate (2–3 tasks) | ~$15–30 |
| S3 | ~$1–3 |
| SES + SNS | ~$5–10 |
| CloudFront | ~$5–10 |
| **Total** | **~$50–130 / month** |

---

## Summary

This architecture transforms Trade Alerts from a single-machine Python script into a fully scalable, cloud-native application on AWS — with user authentication, real-time charts, stock news, theme support, and a clear path to native mobile apps. Each phase builds on the previous one, so the app remains functional throughout the migration.
