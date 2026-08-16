"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, Server, CheckCircle2, ChevronRight, Settings } from "lucide-react";
import socketEventBus from "@/lib/socketEventBus";
import useTradingStore from "@/store/tradingStore";

const BROKERS = [
  { id: "fbk", name: "FBK Markets", regulated: "FSCA", servers: ["FBK-Live", "FBK-Demo"] },
  { id: "veracity", name: "Veracity Markets", regulated: "FSCA", servers: ["Veracity-Live", "Veracity-Demo"] },
  { id: "ifx", name: "IFX Brokers", regulated: "FSCA", servers: ["IFX-Live"] },
  { id: "exness", name: "Exness ZA", regulated: "FSCA", servers: ["Exness-Real1", "Exness-Real2"] }
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    broker: "",
    server: "",
    accountNumber: "",
    riskLevel: "moderate", // conservative, moderate, aggressive
    maxDrawdown: "500"
  });
  const [saving, setSaving] = useState(false);

  const handleNext = () => setStep(s => s + 1);
  const handleBack = () => setStep(s => s - 1);

  const handleComplete = async () => {
    setSaving(true);
    // Persist the risk limit through the backend (update-risk-settings → DB).
    // No fabricated delay — the risk limit is applied server-side.
    const dd = Number(formData.maxDrawdown);
    if (Number.isFinite(dd) && dd > 0) {
      socketEventBus.updateRiskSettings({ maxDailyDrawdown: dd, tradingEnabled: true });
      useTradingStore.getState().updateRiskSettings({ maxDailyDrawdown: dd, tradingEnabled: true });
    }
    setSaving(false);
    router.push("/dashboard"); // Take them to main terminal
  };

  const selectedBrokerConfig = BROKERS.find(b => b.id === formData.broker);

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-void)', fontFamily: 'var(--font-display)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
    }}>
      <div style={{
        width: '100%', maxWidth: '600px', background: 'var(--bg-card)',
        border: '1px solid var(--border-default)', borderRadius: '24px',
        padding: '40px', position: 'relative', overflow: 'hidden',
        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
      }}>
        {/* Glow */}
        <div style={{
          position: 'absolute', top: 0, left: '20%', right: '20%', height: '1px',
          background: 'linear-gradient(90deg, transparent, #00f2ff, transparent)',
        }} />

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
            color: '#00f2ff', marginBottom: '8px',
          }}>
            Step {step} of 3
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '8px' }}>
            {step === 1 ? "Connect Your Broker" : step === 2 ? "Set Risk Parameters" : "Finalize Setup"}
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            {step === 1 ? "Select your FSCA-regulated South African broker for cTrader Open API execution." :
             step === 2 ? "Configure the AI's built-in Risk Shield limits." :
             "Review your settings before accessing the terminal."}
          </p>
        </div>

        {/* Steps Content */}
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Select Broker</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {BROKERS.map(b => (
                      <div key={b.id} onClick={() => setFormData({ ...formData, broker: b.id, server: "" })}
                           style={{
                             padding: '16px', borderRadius: '12px', border: `1px solid ${formData.broker === b.id ? '#00f2ff' : 'var(--border-subtle)'}`,
                             background: formData.broker === b.id ? 'rgba(0,242,255,0.05)' : 'var(--bg-elevated)',
                             cursor: 'pointer', transition: 'all 0.2s'
                           }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <Server size={14} style={{ color: formData.broker === b.id ? '#00f2ff' : 'var(--text-tertiary)' }} />
                          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: formData.broker === b.id ? '#fff' : 'var(--text-secondary)' }}>{b.name}</span>
                        </div>
                        <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>{b.regulated} Regulated</span>
                      </div>
                    ))}
                  </div>
                </div>

                {formData.broker && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>cTrader Server</label>
                    <select 
                      value={formData.server} 
                      onChange={e => setFormData({ ...formData, server: e.target.value })}
                      style={{
                        width: '100%', padding: '14px', borderRadius: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                        color: '#fff', fontSize: '0.875rem', outline: 'none'
                      }}
                    >
                      <option value="">Select Server...</option>
                      {selectedBrokerConfig?.servers.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,15,66,0.05)', border: '1px solid rgba(255,15,66,0.2)', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <ShieldAlert size={18} color="#ff0f42" style={{ marginTop: '2px' }} />
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#ff0f42', marginBottom: '4px' }}>Risk Shield Active</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      The AI will automatically halt trading if these drawdown limits are breached.
                    </div>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>AI Trading Style</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {['conservative', 'moderate', 'aggressive'].map(lvl => (
                      <button key={lvl} onClick={() => setFormData({ ...formData, riskLevel: lvl })}
                        style={{
                          flex: 1, padding: '12px', borderRadius: '8px', cursor: 'pointer',
                          background: formData.riskLevel === lvl ? 'var(--text-primary)' : 'var(--bg-elevated)',
                          color: formData.riskLevel === lvl ? '#000' : 'var(--text-secondary)',
                          border: `1px solid ${formData.riskLevel === lvl ? 'var(--text-primary)' : 'var(--border-subtle)'}`,
                          fontWeight: 600, fontSize: '0.8125rem', textTransform: 'capitalize'
                        }}>
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Max Daily Drawdown (ZAR/USD)</label>
                  <input type="number" value={formData.maxDrawdown} onChange={e => setFormData({ ...formData, maxDrawdown: e.target.value })}
                         placeholder="e.g. 500"
                         style={{
                          width: '100%', padding: '14px', borderRadius: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                          color: '#fff', fontSize: '0.875rem', outline: 'none'
                         }} />
                </div>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}>
                  <CheckCircle2 size={64} color="#00ff88" style={{ margin: '0 auto 24px' }} />
                </motion.div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>All Systems Ready</h3>
                <p style={{ fontSize: '0.9375rem', color: 'var(--text-secondary)', marginBottom: '32px' }}>
                  Your broker {selectedBrokerConfig?.name} is configured and Risk limits are locked.
                </p>

                <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '16px', textAlign: 'left', marginBottom: '32px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '0.875rem' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>Broker:</span>
                    <span style={{ fontWeight: 600 }}>{selectedBrokerConfig?.name}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '0.875rem' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>Server:</span>
                    <span style={{ fontWeight: 600 }}>{formData.server}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>Risk Limit:</span>
                    <span style={{ fontWeight: 600, color: '#ff0f42' }}>{formData.maxDrawdown} Max DD</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px', paddingTop: '24px', borderTop: '1px solid var(--border-subtle)' }}>
          <button 
            onClick={handleBack} 
            disabled={step === 1 || saving}
            style={{ 
              padding: '12px 24px', background: 'transparent', border: 'none', color: step === 1 ? 'transparent' : 'var(--text-secondary)',
              cursor: step === 1 ? 'default' : 'pointer', fontWeight: 600, fontSize: '0.875rem'
            }}>
            Back
          </button>
          
          <button 
            onClick={step === 3 ? handleComplete : handleNext}
            disabled={saving || (step === 1 && (!formData.broker || !formData.server))}
            style={{ 
              padding: '12px 24px', background: 'linear-gradient(135deg, #00f2ff, #00ff88)', border: 'none', color: '#000',
              borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '8px',
              opacity: (step === 1 && (!formData.broker || !formData.server)) || saving ? 0.5 : 1
            }}>
            {saving ? "Finalizing..." : step === 3 ? "Enter Terminal" : "Continue"}
            {!saving && step !== 3 && <ChevronRight size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
