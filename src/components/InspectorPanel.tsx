import React from 'react';
import {
  Film,
  Image as ImageIcon,
  Scissors,
  Sparkles,
  Trash2,
  Type as TypeIcon,
  Wand2,
} from 'lucide-react';
import type {
  BRollDisplayMode,
  BRollItem,
  CaptionItem,
  ClipSegment,
  MotionPreset,
  ProjectState,
  SelectedLayer,
} from '../types/project';
import { formatTimecode } from '../utils/projectOps';

interface InspectorPanelProps {
  project: ProjectState;
  selected: SelectedLayer | null;
  currentTime: number;
  languageHint: string;
  canResolveBRoll: boolean;
  onLanguageHintChange: (lang: string) => void;
  onUpdateClip: (id: string, patch: Partial<ClipSegment>) => void;
  onUpdateCaption: (id: string, patch: Partial<CaptionItem>) => void;
  onUpdateBRoll: (id: string, patch: Partial<BRollItem>) => void;
  onSplitClip: (id: string) => void;
  onDeleteLayer: (layer: SelectedLayer) => void;
  onSeekToTime: (time: number) => void;
  onResolveBRollWithAdapter: (id: string, keyword: string) => void;
}

const CAPTION_HIGHLIGHT_SWATCHES = [
  '#FACC15',
  '#38BDF8',
  '#34D399',
  '#F472B6',
  '#FB923C',
  '#FFFFFF',
];

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  project,
  selected,
  currentTime,
  languageHint,
  canResolveBRoll,
  onLanguageHintChange,
  onUpdateClip,
  onUpdateCaption,
  onUpdateBRoll,
  onSplitClip,
  onDeleteLayer,
  onSeekToTime,
  onResolveBRollWithAdapter,
}) => {
  const selectedClip =
    selected?.track === 'clips'
      ? project.tracks.clips.find((c) => c.id === selected.id) ?? null
      : null;
  const selectedCaption =
    selected?.track === 'captions'
      ? project.tracks.captions.find((c) => c.id === selected.id) ?? null
      : null;
  const selectedBRoll =
    selected?.track === 'brolls'
      ? project.tracks.brolls.find((b) => b.id === selected.id) ?? null
      : null;

  const handleBRollImageUpload = (
    id: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    onUpdateBRoll(id, { mediaUrl: url });
    e.target.value = '';
  };

  return (
    <aside
      aria-label="Layer Inspector Panel"
      className="w-[340px] lg:w-[360px] shrink-0 bg-[#12151C] border-l border-[#252A36] flex flex-col overflow-hidden"
    >
      {/* Inspector Header */}
      <div className="px-4 py-3 border-b border-[#252A36] flex items-center justify-between">
        <div className="flex items-center gap-2">
          {selectedCaption && <TypeIcon className="w-4 h-4 text-amber-400" />}
          {selectedClip && <Film className="w-4 h-4 text-sky-400" />}
          {selectedBRoll && <ImageIcon className="w-4 h-4 text-emerald-400" />}
          {!selected && <Sparkles className="w-4 h-4 text-indigo-400" />}
          <h2 className="font-display text-sm font-semibold text-white">
            {selectedCaption
              ? 'Caption Inspector'
              : selectedClip
                ? 'Clip & Motion Inspector'
                : selectedBRoll
                  ? 'B-Roll Inspector'
                  : 'Project Properties'}
          </h2>
        </div>

        {selected && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const targetTime =
                  selectedCaption?.startTime ??
                  selectedClip?.startTime ??
                  selectedBRoll?.startTime ??
                  0;
                onSeekToTime(targetTime + 0.1);
              }}
              aria-label="Preview selected layer on stage"
              className="px-2 py-1 rounded text-[11px] font-medium text-slate-300 hover:text-white bg-[#1B202C] hover:bg-[#242B3B] border border-[#2C3344] transition-colors cursor-pointer"
            >
              Preview
            </button>
            <button
              type="button"
              onClick={() => onDeleteLayer(selected)}
              aria-label={`Delete selected ${selected.track.slice(0, -1)}`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          </div>
        )}
      </div>

      {/* Scrollable Inspector Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {selectedCaption && (
          <>
            <div className="space-y-1.5">
              <label
                htmlFor="inspector-caption-text"
                className="block text-xs font-medium text-slate-300"
              >
                Caption Text
              </label>
              <textarea
                id="inspector-caption-text"
                rows={3}
                value={selectedCaption.text}
                onChange={(e) =>
                  onUpdateCaption(selectedCaption.id, { text: e.target.value })
                }
                className="w-full rounded-md bg-[#191D26] border border-[#2C3344] focus:border-amber-400 px-3 py-2 text-sm text-white outline-none resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label
                  htmlFor="caption-start"
                  className="block text-xs font-medium text-slate-400"
                >
                  Start (s)
                </label>
                <input
                  id="caption-start"
                  type="number"
                  step={0.1}
                  min={0}
                  max={selectedCaption.endTime - 0.25}
                  value={selectedCaption.startTime}
                  onChange={(e) =>
                    onUpdateCaption(selectedCaption.id, {
                      startTime: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-md bg-[#191D26] border border-[#2C3344] px-2.5 py-1.5 text-xs font-mono-tabular text-white outline-none focus:border-amber-400"
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="caption-end"
                  className="block text-xs font-medium text-slate-400"
                >
                  End (s)
                </label>
                <input
                  id="caption-end"
                  type="number"
                  step={0.1}
                  min={selectedCaption.startTime + 0.25}
                  max={project.meta.duration}
                  value={selectedCaption.endTime}
                  onChange={(e) =>
                    onUpdateCaption(selectedCaption.id, {
                      endTime: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-md bg-[#191D26] border border-[#2C3344] px-2.5 py-1.5 text-xs font-mono-tabular text-white outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-[#252A36]">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="caption-fontsize"
                  className="text-xs font-medium text-slate-300"
                >
                  Font Size
                </label>
                <span className="text-xs font-mono-tabular text-slate-400">
                  {selectedCaption.fontSize}px
                </span>
              </div>
              <input
                id="caption-fontsize"
                type="range"
                min={28}
                max={96}
                step={2}
                value={selectedCaption.fontSize}
                onChange={(e) =>
                  onUpdateCaption(selectedCaption.id, {
                    fontSize: Number(e.target.value),
                  })
                }
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-300">
                  Highlight Color
                </span>
                <span className="text-xs font-mono-tabular text-slate-400">
                  {selectedCaption.highlightColor}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {CAPTION_HIGHLIGHT_SWATCHES.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    aria-label={`Set highlight color ${hex}`}
                    onClick={() =>
                      onUpdateCaption(selectedCaption.id, {
                        highlightColor: hex,
                      })
                    }
                    className={`w-6 h-6 rounded border cursor-pointer transition-transform ${
                      selectedCaption.highlightColor.toUpperCase() === hex
                        ? 'border-white scale-110'
                        : 'border-[#2C3344]'
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
                <label className="sr-only" htmlFor="caption-highlight-picker">
                  Custom highlight color
                </label>
                <input
                  id="caption-highlight-picker"
                  type="color"
                  value={selectedCaption.highlightColor}
                  onChange={(e) =>
                    onUpdateCaption(selectedCaption.id, {
                      highlightColor: e.target.value,
                    })
                  }
                  className="w-7 h-7 rounded bg-transparent border border-[#2C3344] cursor-pointer"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label
                htmlFor="caption-word-highlight"
                className="text-xs font-medium text-slate-300"
              >
                Active Word Highlight
              </label>
              <input
                id="caption-word-highlight"
                type="checkbox"
                checked={selectedCaption.activeWordHighlight}
                onChange={(e) =>
                  onUpdateCaption(selectedCaption.id, {
                    activeWordHighlight: e.target.checked,
                  })
                }
                className="w-4 h-4 accent-amber-400 cursor-pointer"
              />
            </div>

            <div className="space-y-3 pt-2 border-t border-[#252A36]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-300">
                  Position Presets
                </span>
                <div className="flex items-center gap-1">
                  {[
                    { label: 'Top', y: 22 },
                    { label: 'Mid', y: 50 },
                    { label: 'Lower', y: 74 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        onUpdateCaption(selectedCaption.id, {
                          positionX: 50,
                          positionY: preset.y,
                        })
                      }
                      className="px-2 py-1 rounded text-[11px] bg-[#191D26] hover:bg-[#242A38] text-slate-300 border border-[#2C3344] cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-400">
                  <label htmlFor="caption-pos-x">Position X</label>
                  <span className="font-mono-tabular">
                    {selectedCaption.positionX}%
                  </span>
                </div>
                <input
                  id="caption-pos-x"
                  type="range"
                  min={15}
                  max={85}
                  value={selectedCaption.positionX}
                  onChange={(e) =>
                    onUpdateCaption(selectedCaption.id, {
                      positionX: Number(e.target.value),
                    })
                  }
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-400">
                  <label htmlFor="caption-pos-y">Position Y</label>
                  <span className="font-mono-tabular">
                    {selectedCaption.positionY}%
                  </span>
                </div>
                <input
                  id="caption-pos-y"
                  type="range"
                  min={12}
                  max={88}
                  value={selectedCaption.positionY}
                  onChange={(e) =>
                    onUpdateCaption(selectedCaption.id, {
                      positionY: Number(e.target.value),
                    })
                  }
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>
            </div>
          </>
        )}

        {selectedClip && (
          <>
            <div className="space-y-1.5">
              <label
                htmlFor="inspector-clip-label"
                className="block text-xs font-medium text-slate-300"
              >
                Segment Label
              </label>
              <input
                id="inspector-clip-label"
                type="text"
                value={selectedClip.label}
                onChange={(e) =>
                  onUpdateClip(selectedClip.id, { label: e.target.value })
                }
                className="w-full rounded-md bg-[#191D26] border border-[#2C3344] focus:border-sky-400 px-3 py-1.5 text-sm text-white outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label
                  htmlFor="clip-start"
                  className="block text-xs font-medium text-slate-400"
                >
                  Start (s)
                </label>
                <input
                  id="clip-start"
                  type="number"
                  step={0.1}
                  min={0}
                  max={selectedClip.endTime - 0.25}
                  value={selectedClip.startTime}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, {
                      startTime: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-md bg-[#191D26] border border-[#2C3344] px-2.5 py-1.5 text-xs font-mono-tabular text-white outline-none focus:border-sky-400"
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="clip-end"
                  className="block text-xs font-medium text-slate-400"
                >
                  End (s)
                </label>
                <input
                  id="clip-end"
                  type="number"
                  step={0.1}
                  min={selectedClip.startTime + 0.25}
                  max={Math.max(project.meta.duration, selectedClip.endTime + 10)}
                  value={selectedClip.endTime}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, {
                      endTime: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-md bg-[#191D26] border border-[#2C3344] px-2.5 py-1.5 text-xs font-mono-tabular text-white outline-none focus:border-sky-400"
                />
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-[#252A36]">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="clip-automotion-toggle"
                  className="text-xs font-medium text-slate-200"
                >
                  Auto Motion Zoom Keyframes
                </label>
                <input
                  id="clip-automotion-toggle"
                  type="checkbox"
                  checked={selectedClip.autoMotion}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, {
                      autoMotion: e.target.checked,
                    })
                  }
                  className="w-4 h-4 accent-sky-400 cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="clip-motion-preset"
                  className="block text-xs font-medium text-slate-400"
                >
                  Motion Preset
                </label>
                <select
                  id="clip-motion-preset"
                  value={selectedClip.motionPreset}
                  disabled={!selectedClip.autoMotion}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, {
                      motionPreset: e.target.value as MotionPreset,
                    })
                  }
                  className="w-full rounded-md bg-[#191D26] border border-[#2C3344] px-2.5 py-1.5 text-xs text-white outline-none focus:border-sky-400 disabled:opacity-50"
                >
                  <option value="zoom-in">Smooth Zoom In</option>
                  <option value="zoom-out">Smooth Zoom Out</option>
                  <option value="ken-burns-pan">Ken Burns Pan + Zoom</option>
                  <option value="none">Static (None)</option>
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-400">
                  <label htmlFor="clip-motion-intensity">Zoom Scale Peak</label>
                  <span className="font-mono-tabular">
                    {selectedClip.motionIntensity.toFixed(2)}x
                  </span>
                </div>
                <input
                  id="clip-motion-intensity"
                  type="range"
                  min={1.02}
                  max={1.32}
                  step={0.02}
                  disabled={!selectedClip.autoMotion}
                  value={selectedClip.motionIntensity}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, {
                      motionIntensity: Number(e.target.value),
                    })
                  }
                  className="w-full accent-sky-400 cursor-pointer disabled:opacity-50"
                />
              </div>
            </div>

            {selectedClip.viralityNote !== undefined && (
              <div className="space-y-1.5 pt-2 border-t border-[#252A36]">
                <label
                  htmlFor="clip-virality-note"
                  className="block text-xs font-medium text-slate-400"
                >
                  Editorial / Hook Note
                </label>
                <textarea
                  id="clip-virality-note"
                  rows={2}
                  value={selectedClip.viralityNote}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, {
                      viralityNote: e.target.value,
                    })
                  }
                  className="w-full rounded-md bg-[#191D26] border border-[#2C3344] px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-400 resize-none"
                />
              </div>
            )}

            <div className="pt-2 border-t border-[#252A36]">
              <button
                type="button"
                onClick={() => onSplitClip(selectedClip.id)}
                disabled={
                  currentTime <= selectedClip.startTime + 0.25 ||
                  currentTime >= selectedClip.endTime - 0.25
                }
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium bg-[#1B202C] hover:bg-[#232A3A] disabled:opacity-40 text-slate-200 border border-[#2C3344] cursor-pointer disabled:cursor-not-allowed"
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>Split Clip at {formatTimecode(currentTime)}</span>
              </button>
            </div>
          </>
        )}

        {selectedBRoll && (
          <>
            <div className="space-y-1.5">
              <label
                htmlFor="broll-keyword"
                className="block text-xs font-medium text-slate-300"
              >
                Visual Keyword
              </label>
              <div className="flex gap-2">
                <input
                  id="broll-keyword"
                  type="text"
                  value={selectedBRoll.keyword}
                  onChange={(e) =>
                    onUpdateBRoll(selectedBRoll.id, { keyword: e.target.value })
                  }
                  className="flex-1 rounded-md bg-[#191D26] border border-[#2C3344] focus:border-emerald-400 px-3 py-1.5 text-sm text-white outline-none"
                />
                {canResolveBRoll && (
                  <button
                    type="button"
                    onClick={() =>
                      onResolveBRollWithAdapter(
                        selectedBRoll.id,
                        selectedBRoll.keyword
                      )
                    }
                    title="Fetch B-Roll asset from active External Adapter"
                    className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shrink-0 inline-flex items-center gap-1"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>Fetch</span>
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="broll-prompt"
                className="block text-xs font-medium text-slate-400"
              >
                Shot Description / Prompt
              </label>
              <textarea
                id="broll-prompt"
                rows={2}
                value={selectedBRoll.prompt || ''}
                onChange={(e) =>
                  onUpdateBRoll(selectedBRoll.id, { prompt: e.target.value })
                }
                className="w-full rounded-md bg-[#191D26] border border-[#2C3344] px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-400 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label
                  htmlFor="broll-start"
                  className="block text-xs font-medium text-slate-400"
                >
                  Start (s)
                </label>
                <input
                  id="broll-start"
                  type="number"
                  step={0.1}
                  min={0}
                  max={selectedBRoll.endTime - 0.25}
                  value={selectedBRoll.startTime}
                  onChange={(e) =>
                    onUpdateBRoll(selectedBRoll.id, {
                      startTime: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-md bg-[#191D26] border border-[#2C3344] px-2.5 py-1.5 text-xs font-mono-tabular text-white outline-none focus:border-emerald-400"
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="broll-end"
                  className="block text-xs font-medium text-slate-400"
                >
                  End (s)
                </label>
                <input
                  id="broll-end"
                  type="number"
                  step={0.1}
                  min={selectedBRoll.startTime + 0.25}
                  max={project.meta.duration}
                  value={selectedBRoll.endTime}
                  onChange={(e) =>
                    onUpdateBRoll(selectedBRoll.id, {
                      endTime: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-md bg-[#191D26] border border-[#2C3344] px-2.5 py-1.5 text-xs font-mono-tabular text-white outline-none focus:border-emerald-400"
                />
              </div>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-[#252A36]">
              <label
                htmlFor="broll-mode"
                className="block text-xs font-medium text-slate-300"
              >
                Overlay Layout Mode
              </label>
              <select
                id="broll-mode"
                value={selectedBRoll.displayMode}
                onChange={(e) =>
                  onUpdateBRoll(selectedBRoll.id, {
                    displayMode: e.target.value as BRollDisplayMode,
                  })
                }
                className="w-full rounded-md bg-[#191D26] border border-[#2C3344] px-2.5 py-1.5 text-xs text-white outline-none focus:border-emerald-400"
              >
                <option value="pip">Picture-in-Picture Card</option>
                <option value="top-split">Top Half Split-Screen</option>
                <option value="fullscreen-cutaway">Full-Frame Cutaway</option>
              </select>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-400">
                <label htmlFor="broll-opacity">Opacity</label>
                <span className="font-mono-tabular">
                  {Math.round(selectedBRoll.opacity * 100)}%
                </span>
              </div>
              <input
                id="broll-opacity"
                type="range"
                min={0.2}
                max={1}
                step={0.01}
                value={selectedBRoll.opacity}
                onChange={(e) =>
                  onUpdateBRoll(selectedBRoll.id, {
                    opacity: Number(e.target.value),
                  })
                }
                className="w-full accent-emerald-400 cursor-pointer"
              />
            </div>

            {selectedBRoll.displayMode === 'pip' && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-slate-400">
                  <label htmlFor="broll-pos-y">Vertical Offset (Y)</label>
                  <span className="font-mono-tabular">
                    {selectedBRoll.positionY}%
                  </span>
                </div>
                <input
                  id="broll-pos-y"
                  type="range"
                  min={15}
                  max={75}
                  value={selectedBRoll.positionY}
                  onChange={(e) =>
                    onUpdateBRoll(selectedBRoll.id, {
                      positionY: Number(e.target.value),
                    })
                  }
                  className="w-full accent-emerald-400 cursor-pointer"
                />
              </div>
            )}

            <div className="space-y-1.5 pt-2 border-t border-[#252A36]">
              <label
                htmlFor="broll-image-file"
                className="block text-xs font-medium text-slate-300"
              >
                Attach Local Image Asset (Optional)
              </label>
              <input
                id="broll-image-file"
                type="file"
                accept="image/*"
                onChange={(e) => handleBRollImageUpload(selectedBRoll.id, e)}
                className="block w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-[#2C3344] file:text-xs file:font-medium file:bg-[#191D26] file:text-slate-200 hover:file:bg-[#232938] cursor-pointer"
              />
            </div>
          </>
        )}

        {!selected && (
          <div className="space-y-5">
            <p className="text-xs leading-relaxed text-slate-400">
              Select any clip, caption, or B-roll block on the timeline or in the
              9:16 preview stage to adjust timestamps, typography, Auto Motion
              keyframes, or cutaway overlays.
            </p>

            <div className="space-y-2 pt-2 border-t border-[#252A36]">
              <label
                htmlFor="language-hint-select"
                className="block text-xs font-medium text-slate-300"
              >
                Gemini AI Caption Language Hint
              </label>
              <select
                id="language-hint-select"
                value={languageHint}
                onChange={(e) => onLanguageHintChange(e.target.value)}
                className="w-full rounded-md bg-[#191D26] border border-[#2C3344] px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500"
              >
                <option value="Indonesian & English">
                  Indonesian & English (Bilingual)
                </option>
                <option value="Indonesian">Indonesian (Bahasa Indonesia)</option>
                <option value="English">English</option>
              </select>
            </div>

            <div className="pt-2 border-t border-[#252A36] space-y-2.5">
              <h3 className="text-xs font-semibold text-slate-300">
                Track Summary
              </h3>
              <dl className="space-y-2 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-[#1D222D]">
                  <dt className="text-slate-400">Video Clips</dt>
                  <dd className="font-mono-tabular text-sky-400">
                    {project.tracks.clips.length} segments
                  </dd>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-[#1D222D]">
                  <dt className="text-slate-400">Captions</dt>
                  <dd className="font-mono-tabular text-amber-400">
                    {project.tracks.captions.length} phrases
                  </dd>
                </div>
                <div className="flex items-center justify-between py-1">
                  <dt className="text-slate-400">B-Roll Cues</dt>
                  <dd className="font-mono-tabular text-emerald-400">
                    {project.tracks.brolls.length} overlays
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
