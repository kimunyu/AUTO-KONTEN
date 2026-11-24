import React, { useState } from 'react';
import { Check, Copy, Download, Film, Loader2, X } from 'lucide-react';
import type { ProjectState } from '../types/project';

interface ExportModalProps {
  project: ProjectState;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onStartRenderPlayback: () => void;
  onStopRenderPlayback: () => void;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  project,
  canvasRef,
  onStartRenderPlayback,
  onStopRenderPlayback,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderStatus, setRenderStatus] = useState<string>('');

  const formattedJson = JSON.stringify(project, null, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(formattedJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadJson = () => {
    const blob = new Blob([formattedJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (project.meta.title || 'project')
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-');
    a.href = url;
    a.download = `${safeName}.project.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRenderWebM = async () => {
    const canvas = canvasRef.current;
    if (!canvas || typeof MediaRecorder === 'undefined') {
      setRenderStatus('Canvas MediaRecorder is unavailable in this browser.');
      return;
    }

    setIsRendering(true);
    setRenderStatus('Recording 9:16 canvas composition...');

    const stream = canvas.captureStream(30);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunks.push(ev.data);
    };

    recorder.onstop = () => {
      const outBlob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(outBlob);
      const a = document.createElement('a');
      const safeName = (project.meta.title || 'framecut-short')
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-');
      a.href = url;
      a.download = `${safeName}-9x16.webm`;
      a.click();
      URL.revokeObjectURL(url);
      setIsRendering(false);
      setRenderStatus('Render complete and downloaded (.webm).');
      onStopRenderPlayback();
    };

    onStartRenderPlayback();
    recorder.start(250);

    const captureMs = Math.min(project.meta.duration * 1000, 30000);
    setTimeout(() => {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    }, captureMs);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-2xl bg-[#12151C] border border-[#2A3040] rounded-xl overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-[#252A36] flex items-center justify-between">
          <h2
            id="export-modal-title"
            className="font-display text-base font-semibold text-white"
          >
            Export ProjectState JSON & Render
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export modal"
            className="p-1 rounded hover:bg-[#1E2330] text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-400">
              Clean centralized JSON containing meta, clips, captions, and B-roll
              tracks ready for external renderers or FFmpeg pipelines.
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#1B202C] hover:bg-[#242B3B] text-slate-200 border border-[#2C3344] cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy JSON</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownloadJson}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download JSON</span>
              </button>
            </div>
          </div>

          <pre className="h-64 overflow-auto rounded-lg bg-[#0B0D11] border border-[#252A36] p-3 text-xs font-mono-tabular text-slate-300">
            {formattedJson}
          </pre>

          <div className="pt-3 border-t border-[#252A36] flex items-center justify-between gap-4">
            <div className="text-xs text-slate-400">
              {renderStatus ||
                `Browser Canvas Render (${project.meta.duration.toFixed(1)}s real-time WebM export)`}
            </div>
            <button
              type="button"
              disabled={isRendering}
              onClick={handleRenderWebM}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white cursor-pointer shrink-0"
            >
              {isRendering ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Rendering 9:16...</span>
                </>
              ) : (
                <>
                  <Film className="w-3.5 h-3.5" />
                  <span>Render 9:16 WebM</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
