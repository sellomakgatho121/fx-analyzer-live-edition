import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cpu, ChevronDown, Check, Sparkles } from 'lucide-react';

const MODEL_DISPLAY = {
  'opencode:deepseek-v4-flash-free': 'DeepSeek V4 Flash Free',
};

const DEFAULT_MODEL = 'opencode:deepseek-v4-flash-free';

function formatShortLabel(modelStr) {
  const display = MODEL_DISPLAY[modelStr];
  if (display) return display.replace('(Free)', '').trim();
  const parts = modelStr.split('/');
  return parts[parts.length - 1] || modelStr;
}

export default function ModelSelector({ socket, currentModel = DEFAULT_MODEL }) {
  const [isOpen, setIsOpen] = useState(false);
  const [models, setModels] = useState([]);
  const [selected, setSelected] = useState(currentModel);

  useEffect(() => {
    if (!socket) return;

    socket.emit('get-llm-models');

    socket.on('llm-models-list', (list) => {
      if (list && list.length > 0) setModels(list);
    });

    socket.on('model-changed', (newModel) => {
      setSelected(newModel);
    });

    return () => {
      socket.off('llm-models-list');
      socket.off('model-changed');
    };
  }, [socket]);

  const handleSelect = (model) => {
    setSelected(model);
    setIsOpen(false);
    socket.emit('switch-llm-model', model);
  };

  const opencodeModels = useMemo(
    () => models.filter((m) => m.startsWith('opencode:')),
    [models]
  );

  const selectedLabel = MODEL_DISPLAY[selected] || formatShortLabel(selected);

  return (
    <div className="relative z-50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10 transition-colors"
      >
        <Cpu size={14} className="text-cyan-400" />
        <span className="text-sm font-medium text-cyan-100 max-w-[160px] truncate">
          {selectedLabel}
        </span>
        <ChevronDown size={12} className={`text-cyan-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute right-0 mt-2 w-64 bg-[#0a0f18] border border-cyan-500/20 rounded-lg shadow-xl shadow-cyan-900/20 overflow-hidden max-h-[70vh] overflow-y-auto"
          >
            <div className="p-2">
              {opencodeModels.length > 0 && (
                <>
                  <div className="flex items-center gap-1.5 px-2 py-1.5 mb-1">
                    <Sparkles size={12} className="text-cyan-400" />
                    <p className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">
                      OpenCode Zen
                    </p>
                  </div>
                  {opencodeModels.map((model) => (
                    <button
                      key={model}
                      onClick={() => handleSelect(model)}
                      className="w-full text-left px-2 py-1.5 text-sm text-gray-300 hover:bg-white/5 rounded flex justify-between items-center group"
                    >
                      <span className="group-hover:text-white transition-colors">
                        {MODEL_DISPLAY[model] || formatShortLabel(model)}
                      </span>
                      {selected === model && <Check size={12} className="text-cyan-400" />}
                    </button>
                  ))}
                </>
              )}

              {models.length === 0 && (
                <p className="text-xs text-gray-500 px-2 py-2">No models available — check API keys</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
