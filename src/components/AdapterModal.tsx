import React, { useState } from 'react';
import { Blocks, Check, Plus, X } from 'lucide-react';
import type { ExternalModuleProvider } from '../services/externalAdapter';
import { createCustomEndpointProvider } from '../services/externalAdapter';

interface AdapterModalProps {
  providers: ExternalModuleProvider[];
  activeProviderId: string;
  onSelectProvider: (id: string) => void;
  onRegisterProvider: (provider: ExternalModuleProvider) => void;
  onClose: () => void;
}

export const AdapterModal: React.FC<AdapterModalProps> = ({
  providers,
  activeProviderId,
  onSelectProvider,
  onRegisterProvider,
  onClose,
}) => {
  const [name, setName] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const provider = createCustomEndpointProvider({
        name: name || 'Local Whisper / FFmpeg Bridge',
        endpointUrl,
      });
      onRegisterProvider(provider);
      setName('');
      setEndpointUrl('');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Invalid adapter configuration.'
      );
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="adapter-modal-title"
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-xl bg-[#12151C] border border-[#2A3040] rounded-xl overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-[#252A36] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Blocks className="w-4 h-4 text-emerald-400" />
            <h2
              id="adapter-modal-title"
              className="font-display text-base font-semibold text-white"
            >
              External Module Adapters
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close adapter modal"
            className="p-1 rounded hover:bg-[#1E2330] text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <p className="text-xs text-slate-400 leading-relaxed">
            Switch between the built-in Gemini 2.5 Flash analyzer or connect an
            external local/GitHub microservice implementing{' '}
            <code className="text-slate-200 font-mono-tabular">
              ExternalModuleProvider
            </code>{' '}
            (<code className="text-slate-300 font-mono-tabular">/analyze</code>,{' '}
            <code className="text-slate-300 font-mono-tabular">/broll</code>,{' '}
            <code className="text-slate-300 font-mono-tabular">/render</code>).
          </p>

          <div className="space-y-2">
            {providers.map((provider) => {
              const isActive = provider.id === activeProviderId;
              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => onSelectProvider(provider.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer flex items-start justify-between gap-3 ${
                    isActive
                      ? 'bg-blue-600/15 border-blue-500'
                      : 'bg-[#171B24] border-[#252A36] hover:border-[#363F52]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-white">
                      {provider.name}
                    </div>
                    <div className="text-xs text-slate-400">
                      {provider.description}
                    </div>
                  </div>
                  {isActive && (
                    <Check className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  )}
                </button>
              );
            })}
          </div>

          <form
            onSubmit={handleRegister}
            className="pt-4 border-t border-[#252A36] space-y-3"
          >
            <h3 className="text-xs font-semibold text-slate-200">
              Register External Endpoint Adapter
            </h3>

            {error && (
              <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded px-3 py-2">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="adapter-name-input"
                  className="block text-[11px] text-slate-400 mb-1"
                >
                  Adapter Name
                </label>
                <input
                  id="adapter-name-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Whisper + Pexels Server"
                  className="w-full rounded-md bg-[#191D26] border border-[#2C3344] px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label
                  htmlFor="adapter-url-input"
                  className="block text-[11px] text-slate-400 mb-1"
                >
                  Base Endpoint URL
                </label>
                <input
                  id="adapter-url-input"
                  type="url"
                  required
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                  placeholder="http://localhost:8000"
                  className="w-full rounded-md bg-[#191D26] border border-[#2C3344] px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold bg-[#1E2432] hover:bg-[#272F41] text-white border border-[#323A4E] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add & Activate Adapter</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
