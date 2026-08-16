# FX Analyzer Pro — Frontend Restructure Plan

## EXECUTIVE SUMMARY

The current frontend exposes **~30%** of the app's true capabilities. The Python engine has **21 agents**, 2 deep learning models, a full LangGraph workflow, RAG system, and cross-model LLM routing — but the UI shows only the basic MoE consensus (4 agents) and a paper trading panel. This plan restructures the entire frontend to surface **every** capability, organized into logical command centers.

---

## 1. CURRENT STATE VS FULL CAPABILITY MAP

### What the frontend currently exposes
| Feature | UI Coverage | Quality |
|---|---|---|
| MoE Signal 4-agent consensus | ✅ SignalCard + AgentDebate | Good |
| Paper Trading | ✅ PaperTradingDashboard | Good |
| Candlestick Chart | ✅ CandlestickChart | Basic |
| Economic Calendar | ✅ EconomicCalendar | Mock only |
| Trade Panel | ✅ TradePanel | Good |
| MT5 Account | ✅ MT5AccountPanel | Basic |
| Risk Shield | ✅ Basic display | Static |
| Auto-Trade | ✅ AutoTradeSettings | Functional |
| Pair Selector | ✅ PairSelector | Good |
| Ticker Bar | ✅ TickerBar | Good |
| Stats Cards | ✅ StatsCard | Good |
| Auth | ✅ Login + NextAuth | Good |
| Onboarding | ✅ 3-step broker setup | Good |
| Admin | ✅ Users table | Basic |
| Vibe Research Terminal | ✅ VibeResearchTerminal | Basic |

### What the engine has that's NOT in the frontend

| Hidden Capability | Engine Module | Current State |
|---|---|---|
| **LangGraph Workflow (16 agents)** | `workflow_orchestrator.py` | COMPLETELY HIDDEN — full investment debate pipeline |
| **Company Overview Analyst** | `workflow_orchestrator.py` + analysts | Zero UI |
| **6 Parallel Analysts** (market, sentiment, news, fundamentals, shareholder, product) | `workflow_orchestrator.py` /analysts | Zero UI |
| **Bull/Bear Researcher Debate** | `workflow_orchestrator.py` /researchers | Zero UI — currently only shows 4 MoE agents |
| **Research Manager + Trader** | `workflow_orchestrator.py` /managers | Zero UI |
| **3-Round Risk Debate** (aggressive/safe/neutral) | `workflow_orchestrator.py` /risk_management | Zero UI |
| **LSTM Price Prediction** | `deep/lstm_agent.py` | Zero UI — 2-layer LSTM, 6 features |
| **CNN Chart Pattern Detection** | `deep/cnn_agent.py` | Zero UI — 9 patterns, synthetic training |
| **Feature Importance** | LSTM `_feature_importance` | Zero UI |
| **Rule-based Pattern Confirmation** | CNN `_rule_based_patterns` | Zero UI |
| **LLM Analyzer** | `llm_analyzer.py` | Zero UI — 4 providers, model switching |
| **Model Selector** | `llm_analyzer.py` `available_models` | Only basic ModelSelector component |
| **RAG Context Store** | `rag/store.py` + loader | Zero UI |
| **RSS News Loader** | `rag/rss_loader.py` | Zero UI |
| **Vibe Alpha Zoo Benchmarking** | `vibe_research_service.py` | Only terminal output display |
| **Vibe Backtest Engine** | `vibe_research_service.py` | Only terminal output display |
| **Multi-Provider LLM routing** | `llm_analyzer.py` (OpenRouter, DeepSeek, Groq, Gemini) | Zero UI |
| **Data Feed (MT5 + Yahoo + Mock)** | `data_feed.py` | Zero UI — no data source indicator |
| **Executor (Live Trades)** | `executor.py` | No real execution UI |
| **History & Metrics DB queries** | `database.py` | Read-only signals, no query UI |
| **Account Management** | `database.py` users table | Admin only, no user self-service |

**Capability Gap: ~70% of the engine's power has no frontend representation.**

---

## 2. PROPOSED ARCHITECTURE — COMMAND CENTER MODEL

### Navigation Structure (New Sidebar)

```
┌────────────────────────────────────────────┐
│  FX NEXUS PRO                              │
│  ───────────────────────────────────      │
│  🏠  Dashboard (Live Trading HQ)          │
│  📊  Analysis Lab                          │
│  │   ├ Technical Analysis                  │
│  │   ├ Fundamental Screen                  │
│  │   ├ Deep Learning Suite                 │
│  │   └ Pattern Recognition                 │
│  🤖  Agent Arena                           │
│  │   ├ MoE Consensus                       │
│  │   └ LangGraph Debate Theater            │
│  💹  Trading Terminal                       │
│  │   ├ Live Execution                      │
│  │   ├ Paper Trading Suite                 │
│  │   └ Auto-Trade Console                  │
│  📈  Portfolio & Risk                      │
│  │   ├ P&L Dashboard                      │
│  │   ├ Risk Shield Control                 │
│  │   └ MT5 Account Manager                 │
│  🔬  Research & Backtest                   │
│  │   ├ Vibe Research Terminal              │
│  │   ├ Alpha Factor Zoo                    │
│  │   └ RAG Knowledge Base                  │
│  ⚙️  System                                │
│  │   ├ Settings & Models                   │
│  │   ├ Admin Panel                         │
│  │   └ API Status                          │
└────────────────────────────────────────────┘
```

### Layout Architecture

```
┌─────────────────────────────────────────────────────────┐
│ HEADER: PairSelector | Ticker | ModelSelector | Status  │
├────────────┬────────────────────────────────────────────┤
│            │                                            │
│ SIDEBAR    │   MAIN CONTENT AREA                        │
│ (Nav)      │   (Route-based page rendering)             │
│            │                                            │
│ Collapsible│   ├ Dashboard (default /)                  │
│            │   ├ AnalysisLab (/analysis)                 │
│            │   ├ AgentArena (/agents)                    │
│            │   ├ Trading (/trading)                      │
│            │   ├ Portfolio (/portfolio)                   │
│            │   ├ Research (/research)                    │
│            │   └ Settings (/settings)                    │
│            │                                            │
├────────────┴────────────────────────────────────────────┤
│ STATUS BAR: Connection | Last Signal | Engine Health    │
└─────────────────────────────────────────────────────────┘
```

---

## 3. COMPONENT HIERARCHY — FULL REDESIGN

### NEW COMPONENTS TO BUILD (🚀 = High Priority)

#### Dashboard (Reimagined)
- **`LiveTickerBar`** — Rebuild with scrollable multi-pair prices, percent change, spread
- **`CommandCenter`** — Top-level grid of mini-widgets (latest signal, risk status, open trades, account equity)
- **`LiveSignalsFeed`** — Real-time scrollable signal list (replaces SignalCard stacking)
- **`MiniChartGrid`** — Small sparklines for top 4 pairs
- **`AlertBar`** — News events, risk warnings, system notifications

#### Analysis Lab (NEW SECTION)
- **`TechnicalAnalysisPanel`** — RSI, MACD, EMA, BB visualization with agent overlay
- **`FundamentalScreen`** — Macro-economic context display, news feed, RAG context viewer
- **`DeepLearningPanel`** 🚀 — LSTM prediction display with:
  - Price direction signal (bullish/bearish/neutral with confidence)
  - Feature importance bar chart (ret_1, ret_5, vol_ratio, RSI, BB%, ATR)
  - Price target display
  - Model training status indicator
- **`PatternRecognitionPanel`** 🚀 — CNN output with:
  - Detected pattern name + confidence
  - Historical pattern timeline
  - Rule-based confirmation indicators
  - 9-pattern probability distribution chart
- **`MultiTimeframeView`** — Same pair across M1, M5, M15, H1, H4, D1

#### Agent Arena (NEW SECTION)
- **`MoEConsensusPanel`** — Enhanced 4-agent MoE display (upgrade current AgentDebate):
  - Real-time agent reasoning streaming
  - Agent confidence comparison chart
  - Verification breakdown radar/spider chart
  - Signal history timeline
- **`LangGraphDebateTheater`** 🚀 (BIG NEW FEATURE) — Full 16-agent workflow visualization:
  - **Phase 0**: Company Overview analyst card
  - **Phase 1**: 6 parallel analysts in a grid (market, sentiment, news, fundamentals, shareholder, product)
  - **Phase 2**: Bull/Bear debate timeline with round counter (up to 3 rounds)
  - **Phase 3**: Research Manager synthesis view
  - **Phase 4**: Trader decision panel
  - **Phase 5**: 3-risk analyst debate (aggressive, safe, neutral) with round counter
  - **Phase 6**: Risk Manager final ruling
  - *All visualized as a live DAG/timeline with agent avatars, streaming text, colored by sentiment*

#### Trading Terminal (Enhanced)
- **`ExecutionConsole`** 🚀 — Real execution panel (stop loss, take profit, lot size, order types)
- **`PaperTradingSuite`** — Enhanced with:
  - Equity curve chart
  - Win/loss distribution histogram
  - Profit factor, Sharpe-like metrics
  - Trade journal with notes
  - Position sizing calculator
- **`AutoTradeConsole`** — Full automation control:
  - Strategy selector (MoE consensus, LSTM signals, CNN patterns, combinations)
  - Risk per trade, max daily trades, session hours
  - Auto-trade audit log
  - Strategy performance comparison

#### Portfolio & Risk (NEW SECTION)
- **`PnLDashboard`** — Full P&L with:
  - Cumulative return chart
  - Monthly breakdown bar chart
  - Drawdown curve
  - Trade distribution (long vs short)
  - Win rate trend over time
- **`RiskShieldControl`** — Full control panel:
  - Max drawdown slider
  - Max leverage selector
  - ATR-based volatility regime indicator (LOW_VOL / HIGH_VOL / EXTREME)
  - Risk agent recommendations panel
  - Kill switch (emergency stop all)
- **`MT5AccountManager`** — Enhanced:
  - Account summary (balance, equity, margin, free margin, margin level)
  - Open positions from MT5
  - Order history from MT5
  - Server connection status

#### Research & Backtest (Enhanced)
- **`VibeResearchTerminal`** — Enhanced with:
  - Research run history list
  - Backtest results comparison
  - Strategy parameter tuning UI
- **`AlphaFactorZoo`** 🚀 — (NEW) Factor analysis display:
  - Top 20 factors with IC, Rank ICIR, annualized return
  - Factor zoo browser
  - Factor correlation matrix visualization
  - Custom factor builder
- **`RAGKnowledgeBase`** 🚀 (NEW):
  - RAG context viewer (what's being retrieved)
  - Document upload/search UI
  - News feed with sentiment overlay
  - Memory/conversation browser

#### Settings & System
- **`ModelSelector`** — Enhanced with:
  - Full provider list (OpenRouter, DeepSeek, Groq, Gemini)
  - Model-specific parameter tuning (temperature, max tokens)
  - Provider API key status indicators
  - Active model switching with test button
- **`DataFeedStatus`** — (NEW) Data source indicator:
  - MT5 / Yahoo / Mock mode indicator
  - Last data refresh timestamp
  - Available symbols list
- **`SystemConsole`** — (NEW):
  - Backend connection status
  - WebSocket/ZMQ bridge health
  - Database size/status
  - Agent pool health

### COMPONENTS TO REFACTOR

| Component | Refactor Scope |
|---|---|
| **SignalCard** | Add LSTM/CNN signal indicators, auto-trade status, better expand layout |
| **AgentDebate** | Add streaming text, confidence comparison bars, agent response timing |
| **CandlestickChart** | Add LSTM overlay line, CNN pattern annotations, multi-timeframe toggle |
| **TradePanel** | Add order type selection (market/limit/stop), advanced SL/TP, position sizing calc |
| **StatsCard** | Redesign as clickable mini-dashboard with drill-down modal |
| **EconomicCalendar** | Connect to real data source, add country filter, impact filter |
| **RiskShield** | Connect to actual Risk Agent output (ATR regime, max leverage recommendation) |

---

## 4. DATA FLOW REDESIGN

### Current Data Flow
```
Engine Agents (Python)
      │
      ▼  ZMQ
   Bridge.py ──► WebSocket ──► frontend Socket.IO client
      │
      ▼
   AgentBridge.py (WebSocket Server)
      │
      ▼
   Dashboard page useEffect (direct socket handling)
```

### Proposed Data Flow
```
Engine Agents (Python) ──► MoEOrchestrator ──► Bridge.py
                                                      │
                                                      ▼  ZMQ
WorkflowOrchestrator ──► AgentBridge.py (WebSocket)
(LangGraph)                    │
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
   Socket Context      REST API (Next.js)     Database
   (Provider)              │                    (SQLite)
          │                │
          ▼                ▼
   SocketEventBus     React Query / SWR
   (useSocket hook)   (data fetching)
          │
          ▼
   Zustand Store (Global State)
      ├ sessionStore (auth, user)
      ├ tradingStore (signals, trades, positions)
      ├ agentStore (agent responses, debate state)
      ├ analysisStore (LSTM, CNN, RAG context)
      └ uiStore (theme, sidebar, preferences)
```

### New Socket Event Protocol
```
Events to Subscribe:
  ─ signal:new          — New MoE consensus signal
  ─ signal:update       — Signal status change (filled, cancelled)
  ─ trade:executed      — Trade executed (live or paper)
  ─ trade:closed        — Trade closed with P&L
  ─ agent:response      — Individual agent response (for streaming)
  ─ agent:debate_round  — LangGraph debate round update
  ─ agent:debate_end    — LangGraph debate complete
  ─ lstm:prediction     — LSTM prediction result
  ─ cnn:pattern         — CNN pattern detection result
  ─ research:backtest   — Vibe backtest completed
  ─ research:alpha_bench — Alpha benchmark completed
  ─ rag:context_update  — RAG context refreshed
  ─ market:price        — Real-time price tick
  ─ risk:update         — Risk assessment update
  ─ system:status       — System health status
  ─ system:error        — Engine error
```

---

## 5. IMPLEMENTATION PHASES

### Phase 1 — Foundation & Deep Learning Suite (🚀 DO FIRST)
**What**: Build the Analysis Lab with LSTM + CNN panels, create shared state management, establish the new navigation shell.

**Files to create:**
- `frontend/src/app/(main)/layout.js` — Shell layout with sidebar
- `frontend/src/app/(main)/dashboard/page.js` — New dashboard
- `frontend/src/app/(main)/analysis/page.js` — Analysis Lab
- `frontend/src/store/` — Zustand stores
- `frontend/src/hooks/useSocket.js` — Socket event bus
- `frontend/src/components/DeepLearningPanel.jsx` — LSTM output display
- `frontend/src/components/PatternRecognitionPanel.jsx` — CNN output display
- `frontend/src/components/FeatureImportanceChart.jsx` — Feature importance bars
- `frontend/src/components/PatternProbabilityChart.jsx` — 9-pattern distribution

### Phase 2 — Agent Arena (LangGraph Debate Theater)
**What**: Surface the full 16-agent workflow in a visual DAG.

**Files to create:**
- `frontend/src/components/agent-arena/DebateTimeline.jsx`
- `frontend/src/components/agent-arena/AgentCardNew.jsx`
- `frontend/src/components/agent-arena/ParallelAnalystsGrid.jsx`
- `frontend/src/components/agent-arena/ResearchDebatePanel.jsx`
- `frontend/src/components/agent-arena/RiskDebatePanel.jsx`
- `frontend/src/components/agent-arena/TraderDecisionPanel.jsx`
- `frontend/src/app/(main)/agents/page.js`

### Phase 3 — Enhanced Trading Terminal
**What**: Real execution console, upgraded paper trading, auto-trade console.

### Phase 4 — Portfolio & Risk Dashboard
**What**: Full P&L analytics, connected risk shield control, MT5 manager.

### Phase 5 — Research Suite
**What**: Enhanced Vibe terminal, Alpha Factor Zoo UI, RAG Knowledge Base.

### Phase 6 — Settings & Polish
**What**: Model management, data feed status, system console, admin enhancements.

---

## 6. COMPONENT TREE (Future State)

```
App
├── Providers (SessionProvider, SocketProvider, ZustandProvider)
├── ShellLayout
│   ├── Sidebar (collapsible navigation)
│   ├── Header
│   │   ├── PairSelector
│   │   ├── LiveTickerBar (multi-pair scroll)
│   │   ├── ModelSelector (enhanced)
│   │   └── ConnectionStatus
│   ├── MainContent (router)
│   │   ├── Dashboard
│   │   │   ├── CommandCenter (mini-widget grid)
│   │   │   ├── LiveSignalsFeed
│   │   │   ├── MiniChartGrid
│   │   │   ├── CandlestickChart (main)
│   │   │   ├── TradePanel
│   │   │   └── EconomicCalendar
│   │   ├── AnalysisLab
│   │   │   ├── TechnicalAnalysisPanel
│   │   │   ├── FundamentalScreen
│   │   │   ├── DeepLearningPanel
│   │   │   │   ├── LSTMPredictionCard
│   │   │   │   ├── FeatureImportanceChart
│   │   │   │   └── TrainingStatus
│   │   │   └── PatternRecognitionPanel
│   │   │       ├── PatternDisplayCard
│   │   │       ├── PatternProbabilityChart
│   │   │       └── RuleBasedConfirmation
│   │   ├── AgentArena
│   │   │   ├── MoEConsensusPanel (enhanced)
│   │   │   └── LangGraphDebateTheater
│   │   │       ├── PhaseIndicator (0-6 steps)
│   │   │       ├── CompanyOverviewCard
│   │   │       ├── ParallelAnalystsGrid (6-pack)
│   │   │       ├── BullBearDebate (timeline)
│   │   │       ├── ResearchManagerCard
│   │   │       └── RiskDebatePanel (3-round)
│   │   ├── Trading
│   │   │   ├── ExecutionConsole
│   │   │   ├── PaperTradingSuite
│   │   │   └── AutoTradeConsole
│   │   ├── Portfolio
│   │   │   ├── PnLDashboard
│   │   │   ├── RiskShieldControl
│   │   │   └── MT5AccountManager
│   │   ├── Research
│   │   │   ├── VibeResearchTerminal (enhanced)
│   │   │   ├── AlphaFactorZoo
│   │   │   └── RAGKnowledgeBase
│   │   └── Settings
│   │       ├── ModelManagement
│   │       ├── DataFeedStatus
│   │       └── SystemConsole
│   └── Footer (StatusBar)
└── Modals (PaperTradingDashboard, MetricDetails, etc.)
```

---

## 7. DESIGN SYSTEM ENHANCEMENTS

### New Color Tokens
```css
/* Agent-specific colors */
--agent-technical: #00f2ff    /* Cyan */
--agent-fundamental: #00ff88  /* Emerald */
--agent-sentiment: #a855f7    /* Violet */
--agent-risk: #f97316         /* Orange */
--agent-lstm: #ff6b9d         /* Pink */
--agent-cnn: #fbbf24          /* Amber */
--agent-bull: #00ff88         /* Bullish green */
--agent-bear: #ff0f42         /* Bearish red */
--agent-debate: #8b5cf6       /* Purple for debate */
```

### New UI Patterns
1. **Live Agent Streaming** — Animated text reveal as agents respond
2. **Debate DAG Visualization** — Directed acyclic graph showing agent conversation flow
3. **Confidence Comparison** — Horizontal stacked bar chart comparing agents
4. **Radar/Spider Charts** — Multi-attribute verification breakdown
5. **Equity Curves** — Interactive P&L timeline with zoom
6. **Pattern Timeline** — Historical chart pattern markers on candlestick chart
7. **Probability Distributions** — Bar charts for pattern/price prediction confidence

---

## 8. KEY ARCHITECTURAL DECISIONS

1. **Next.js App Router** — Use `/app/(main)/` route group for authenticated pages
2. **Zustand** over React Context for global state (performance, easier debugging)
3. **Single Socket Connection** — All engine events via one WebSocket, routed to stores
4. **React Query (TanStack Query)** for REST API calls (admin, historical data)
5. **Recharts** for financial charts (equity curves, distributions, comparisons)
6. **Framer Motion** continued for animations (already in project)
7. **Lucide Icons** continued (already in project)
8. **CSS Variables + Tailwind** — Hybrid approach (existing pattern)

---

## 9. FILES TO CREATE/MODIFY (COMPLETE LIST)

### New Route Pages
```
frontend/src/app/(main)/layout.js
frontend/src/app/(main)/dashboard/page.js (rewrite)
frontend/src/app/(main)/analysis/page.js
frontend/src/app/(main)/agents/page.js
frontend/src/app/(main)/trading/page.js
frontend/src/app/(main)/portfolio/page.js
frontend/src/app/(main)/research/page.js
frontend/src/app/(main)/settings/page.js
```

### New Components
```
frontend/src/components/layout/Sidebar.jsx
frontend/src/components/layout/Header.jsx
frontend/src/components/layout/StatusBar.jsx
frontend/src/components/dashboard/CommandCenter.jsx
frontend/src/components/dashboard/LiveSignalsFeed.jsx
frontend/src/components/dashboard/MiniChartGrid.jsx
frontend/src/components/dashboard/AlertBar.jsx
frontend/src/components/analysis/DeepLearningPanel.jsx
frontend/src/components/analysis/FeatureImportanceChart.jsx
frontend/src/components/analysis/LSTMPredictionCard.jsx
frontend/src/components/analysis/PatternRecognitionPanel.jsx
frontend/src/components/analysis/PatternProbabilityChart.jsx
frontend/src/components/analysis/TechnicalAnalysisPanel.jsx
frontend/src/components/analysis/FundamentalScreen.jsx
frontend/src/components/agent-arena/DebateTimeline.jsx
frontend/src/components/agent-arena/AgentCardNew.jsx
frontend/src/components/agent-arena/ParallelAnalystsGrid.jsx
frontend/src/components/agent-arena/BullBearDebate.jsx
frontend/src/components/agent-arena/ResearchManagerCard.jsx
frontend/src/components/agent-arena/TraderDecisionPanel.jsx
frontend/src/components/agent-arena/RiskDebatePanel.jsx
frontend/src/components/agent-arena/PhaseIndicator.jsx
frontend/src/components/trading/ExecutionConsole.jsx
frontend/src/components/trading/PaperTradingSuite.jsx
frontend/src/components/trading/AutoTradeConsole.jsx
frontend/src/components/portfolio/PnLDashboard.jsx
frontend/src/components/portfolio/RiskShieldControl.jsx
frontend/src/components/portfolio/MT5AccountManager.jsx
frontend/src/components/research/AlphaFactorZoo.jsx
frontend/src/components/research/RAGKnowledgeBase.jsx
frontend/src/components/research/VibeResearchTerminalEnhanced.jsx
frontend/src/components/settings/ModelManagement.jsx
frontend/src/components/settings/DataFeedStatus.jsx
frontend/src/components/settings/SystemConsole.jsx
```

### New State Management
```
frontend/src/store/sessionStore.js
frontend/src/store/tradingStore.js
frontend/src/store/agentStore.js
frontend/src/store/analysisStore.js
frontend/src/store/uiStore.js
frontend/src/hooks/useSocket.js
frontend/src/hooks/useLangGraph.js
frontend/src/lib/socketEventBus.js
```

### Files to Refactor
```
frontend/src/components/SignalCard.jsx (enhance)
frontend/src/components/AgentDebate.js (upgrade)
frontend/src/components/CandlestickChart.jsx (enhance)
frontend/src/components/TradePanel.jsx (enhance)
frontend/src/components/StatsCard.jsx (redesign)
frontend/src/components/EconomicCalendar.jsx (enhance)
frontend/src/app/globals.css (add tokens)
```

---

## 10. RISKS & MITIGATIONS

| Risk | Mitigation |
|---|---|
| **Engine expects WebSocket port 4000** — hardcoded | Create config/env var in Zustand store |
| **LangGraph workflow is Python-only** — no JS SDK | Frontend listens to `agent:*` socket events; bridge.py must emit them |
| **LSTM/CNN run async in Python** — may be slow | Add loading states + skeleton UI + cancel support |
| **Vibe Research CLI may not be installed** | Frontend shows "not available" gracefully with mock data fallback |
| **SQLite in production** | Abstract DB behind REST API layer (already partially done via backend) |
| **Gemini API key required** | Show key config UI in Settings with status check |

---

## 11. IMMEDIATE NEXT STEPS (After Approval)

1. Create the shell layout with sidebar navigation
2. Build the Zustand stores + socket event bus
3. Build Deep Learning Panel (LSTM + CNN outputs)
4. Wire to engine WebSocket events
5. Build Agent Arena with LangGraph Debate Theater
6. Iterate

---

*Plan generated 2026-06-30 — based on full codebase analysis of 335 files, 21 agents, 2 deep learning models, and current frontend state.*
