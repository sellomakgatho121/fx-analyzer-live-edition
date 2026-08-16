'use client';
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, User, Server, SlidersHorizontal, Cpu, Loader2, Save, RefreshCw, ShieldCheck } from 'lucide-react';
import useSessionStore from '@/store/sessionStore';
import useTradingStore from '@/store/tradingStore';
import socketEventBus from '@/lib/socketEventBus';

/**
 * Phase 3 (T7): persisted settings.
 * Risk limits → update-risk-settings (backend DB, survives restart, enforced
 * by the execution shield). Broker panel → mt5-get-status / mt5-reconnect
 * (stable wire names; broker-status is the cTrader alias of the payload).
 * Model selector → get-llm-models / switch-llm-model.
 */
export default function SettingsPage() {
  const user = useSessionStore((s) => s.user);
  const modelName = useSessionStore((s) => s.modelName);
  const riskSettings = useTradingStore((s) => s.riskSettings);

  const [broker, setBroker] = useState(null);
  const [models, setModels] = useState([]);
  const [modelLoading, setModelLoading] = useState(true);
  const [form, setForm] = useState(null); // seeded from store once
  const [savedFlash, setSavedFlash] = useState(false);
  const [brokerLoading, setBrokerLoading] = useState(true);

  // Seed risk form from the persisted store value
  useEffect(() => {
    if (form === null && riskSettings) {
      setForm({ ...riskSettings });
    }
  }, [riskSettings, form]);

  // Broker status (mt5-status is the stable wire name; broker-status is the
  // cTrader alias of the same payload).
  useEffect(() => {
    socketEventBus.getBrokerStatus();
    const t = setTimeout(() => setBrokerLoading(false), 1500);
    const onStatus = (status) => {
      setBroker(status);
      setBrokerLoading(false);
    };
    socketEventBus.on('mt5-status', onStatus);
    socketEventBus.on('broker-status', onStatus);
    return () => {
      clearTimeout(t);
      socketEventBus.off('mt5-status', onStatus);
      socketEventBus.off('broker-status', onStatus);
    };
  }, []);

  // Models
  useEffect(() => {
    socketEventBus.emitGetModels();
    const onModels = (list) => {
      setModels(Array.isArray(list) ? list : []);
      setModelLoading(false);
    };
    socketEventBus.on('llm-models-list', onModels);
    const t = setTimeout(() => setModelLoading(false), 3000);
    return () => {
      clearTimeout(t);
      socketEventBus.off('llm-models-list', onModels);
    };
  }, []);

  // Persist confirmation
  useEffect(() => {
    const onSaved = () => {
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    };
    socketEventBus.on('risk:update', onSaved);
    return () => socketEventBus.off('risk:update', onSaved);
  }, []);

  const saveRisk = () => {
    if (!form) return;
    socketEventBus.updateRiskSettings({
      maxDailyDrawdown: Number(form.maxDailyDrawdown),
      maxOpenPositions: Number(form.maxOpenPositions),
      maxRiskPerTrade: Number(form.maxRiskPerTrade),
      maxDailyTrades: Number(form.maxDailyTrades),
      minConfidence: Number(form.minConfidence),
    });
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const field = (label, key, step = '0.01') => (
    <div>
      <label className="block text-xs font-mono uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      <input className="input" type="number" step={step} value={form?.[key] ?? ''} onChange={set(key)} />
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)' }}>
          <Settings size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Settings</h1>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Account · Broker connection · Risk limits · Model</p>
        </div>
      </motion.div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Account */}
        <div className="rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
          <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-tertiary)' }}>
            <User size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} /> Account
          </h3>
          {user ? (
            <div className="space-y-2 text-sm font-mono">
              <div className="flex justify-between"><span style={{ color: 'var(--text-tertiary)' }}>Name</span><span style={{ color: 'var(--text-primary)' }}>{user.name}</span></div>
              <div className="flex justify-between"><span style={{ color: 'var(--text-tertiary)' }}>Email</span><span style={{ color: 'var(--text-primary)' }}>{user.email}</span></div>
              <div className="flex justify-between"><span style={{ color: 'var(--text-tertiary)' }}>Role</span><span style={{ color: user.role === 'admin' ? 'var(--neon-cyan)' : 'var(--text-primary)' }}>{user.role.toUpperCase()}</span></div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-tertiary)' }}>Subscription</span>
                <span style={{ color: user.subscription === 'active' ? 'var(--neon-emerald)' : 'var(--text-secondary)' }}>
                  {user.subscription === 'active' ? 'PRO' : 'FREE'}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Not signed in.</div>
          )}
        </div>

        {/* Broker */}
        <div className="rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
              <Server size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} /> Broker Connection
            </h3>
            <button onClick={() => { setBrokerLoading(true); socketEventBus.brokerReconnect(); }} className="flex items-center gap-1.5 text-xs font-mono" style={{ color: 'var(--neon-cyan)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <RefreshCw size={11} /> Reconnect
            </button>
          </div>

          {brokerLoading && !broker ? (
            <div className="flex items-center gap-2 text-sm font-mono" style={{ color: 'var(--text-tertiary)' }}>
              <Loader2 size={14} className="animate-spin" /> Querying broker…
            </div>
          ) : broker ? (
            <div className="space-y-2 text-sm font-mono">
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-tertiary)' }}>Status</span>
                <span className="flex items-center gap-1.5" style={{ color: broker.connected ? 'var(--neon-emerald)' : 'var(--neon-ruby)' }}>
                  {broker.connected ? <ShieldCheck size={13} /> : <span>●</span>}
                  {broker.connected ? 'CONNECTED' : 'DISCONNECTED'}
                </span>
              </div>
              {broker.account != null && <div className="flex justify-between"><span style={{ color: 'var(--text-tertiary)' }}>Account</span><span>#{broker.account}</span></div>}
              {broker.server && <div className="flex justify-between"><span style={{ color: 'var(--text-tertiary)' }}>Server</span><span>{broker.server}</span></div>}
              {broker.balance != null && <div className="flex justify-between"><span style={{ color: 'var(--text-tertiary)' }}>Balance</span><span>${Number(broker.balance).toFixed(2)}</span></div>}
              {broker.equity != null && <div className="flex justify-between"><span style={{ color: 'var(--text-tertiary)' }}>Equity</span><span style={{ color: 'var(--neon-emerald)' }}>${Number(broker.equity).toFixed(2)}</span></div>}
              {broker.broker && <div className="flex justify-between"><span style={{ color: 'var(--text-tertiary)' }}>Provider</span><span className="uppercase">{broker.broker}</span></div>}
            </div>
          ) : (
            <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Broker status unavailable — engine offline.</div>
          )}
        </div>

        {/* Risk limits */}
        <div className="rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
          <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-tertiary)' }}>
            <SlidersHorizontal size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} /> Risk Limits
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {field('Max Daily Drawdown ($)', 'maxDailyDrawdown', '10')}
            {field('Max Open Positions', 'maxOpenPositions', '1')}
            {field('Max Risk / Trade (%)', 'maxRiskPerTrade', '0.5')}
            {field('Max Daily Trades', 'maxDailyTrades', '1')}
            {field('Min Confidence (0–1)', 'minConfidence', '0.05')}
          </div>
          <div className="flex items-center gap-3 mt-5">
            <button className="btn btn-primary" onClick={saveRisk} disabled={!form}>
              <Save size={13} /> Save Limits
            </button>
            {savedFlash && <span className="text-xs font-mono" style={{ color: 'var(--neon-emerald)' }}>Saved ✓</span>}
          </div>
        </div>

        {/* Model selector */}
        <div className="rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
          <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-tertiary)' }}>
            <Cpu size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} /> Engine Model
          </h3>
          {modelLoading && models.length === 0 ? (
            <div className="flex items-center gap-2 text-sm font-mono" style={{ color: 'var(--text-tertiary)' }}>
              <Loader2 size={14} className="animate-spin" /> Fetching models…
            </div>
          ) : models.length > 0 ? (
            <select
              className="input w-full"
              value={models.includes(modelName) ? modelName : models[0]}
              onChange={(e) => socketEventBus.switchModel(e.target.value)}
            >
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              Model list unavailable (engine offline). Current: <span className="font-mono" style={{ color: 'var(--neon-cyan)' }}>{modelName}</span>
            </div>
          )}
          <p className="text-xs mt-3" style={{ color: 'var(--text-tertiary)' }}>
            Switch the LLM powering the engine agents — persisted server-side.
          </p>
        </div>
      </div>
    </div>
  );
}