import React, { useRef } from 'react';
import {
  Download,
  Film,
  Loader2,
  Blocks,
  Sparkles,
  Upload,
} from 'lucide-react';
import type { AnalysisProgress, ProjectMeta } from '../types/project';
import { formatTimecode } from '../utils/projectOps';

interface TopBarProps {
  meta: ProjectMeta;
  clipCount: number;
  captionCount: number;
  brollCount: number;
  analysis: AnalysisProgress;
  activeProviderName: string;
  onTitleChange: (title: string) => void;
  onUploadVideo: (file: File) => void;
  onAnalyze: () => void;
  onOpenExport: () => void;
  onOpenAdapter: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  meta,
  clipCount,
  captionCount,
  brollCount,
  analysis,
  activeProviderName,
  onTitleChange,
  onUploadVideo,
  onAnalyze,
  onOpenExport,
  onOpenAdapter,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAnalyzing =
    analysis.status === 'preparing' || analysis.status === 'analyzing';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadVideo(file);
    }
    e.target.value = '';
  };

  return (
    <header className="h-14 px-4 bg-[#12151C] border-b border-[#252A36] flex items-center justify-between gap-4 shrink-0">
      {/* Left: Studio wordmark + inline project title + unboxed metadata */}
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center text-white">
            <Film className="w-4 h-4" />
          </div>
          <span className="font-display font-semibold text-sm tracking-tight text-white whitespace-nowrap">
            FrameCut Studio
          </span>
        </div>

        <span className="text-[#343B4C] select-none" aria-hidden="true">
          /
        </span>

        <label className="sr-only" htmlFor="project-title-input">
          Project title
        </label>
        <input
          id="project-title-input"
          type="text"
          value={meta.title}
          onChange={(e) => onTitleChange(e.target.value)}
          className="bg-transparent text-sm font-medium text-slate-100 border border-transparent hover:border-[#2C3344] focus:border-blue-500 focus:bg-[#181C26] rounded px-2 py-1 outline-none transition-colors w-56 lg:w-64 truncate"
          placeholder="Untitled Short"
        />

        <div className="hidden xl:flex items-center gap-2 text-xs text-slate-400 font-mono-tabular whitespace-nowrap">
          <span>9:16</span>
          <span aria-hidden="true">·</span>
          <span>{formatTimecode(meta.duration)}</span>
          <span aria-hidden="true">·</span>
          <span>
            {clipCount} clips · {captionCount} captions · {brollCount} B-roll
          </span>
        </div>
      </div>

      {/* Right: Studio Actions */}
      <div className="flex items-center gap-2.5 shrink-0">
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,audio/*"
          onChange={handleFileChange}
          className="hidden"
          aria-label="Upload local video or audio file"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#1B202C] hover:bg-[#232938] text-slate-200 border border-[#2C3344] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <Upload className="w-3.5 h-3.5 text-slate-300" />
          <span>Upload Video</span>
        </button>

        <button
          type="button"
          onClick={onOpenAdapter}
          title={`Active module adapter: ${activeProviderName}`}
          className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#1B202C] hover:bg-[#232938] text-slate-300 border border-[#2C3344] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <Blocks className="w-3.5 h-3.5 text-emerald-400" />
          <span>Adapters</span>
        </button>

        <button
          type="button"
          onClick={onAnalyze}
          disabled={isAnalyzing}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-400"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Analyzing...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              <span>Analyze with Gemini AI</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onOpenExport}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-400"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export JSON / Render</span>
        </button>
      </div>
    </header>
  );
};
