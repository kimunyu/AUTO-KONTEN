import React, { useRef, useState } from 'react';
import {
  Film,
  Image as ImageIcon,
  Plus,
  Scissors,
  Type as TypeIcon,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  ProjectState,
  SelectedLayer,
  TrackType,
} from '../types/project';
import { formatTimecode, roundTime } from '../utils/projectOps';

interface TimelineEditorProps {
  project: ProjectState;
  currentTime: number;
  selected: SelectedLayer | null;
  onSeek: (time: number) => void;
  onSelect: (layer: SelectedLayer | null) => void;
  onAddTrackItem: (track: TrackType) => void;
  onShiftItem: (track: TrackType, id: string, deltaSeconds: number) => void;
  onTrimItem: (
    track: TrackType,
    id: string,
    edge: 'start' | 'end',
    newTime: number
  ) => void;
  onSplitActiveClip: () => void;
}

type DragState =
  | {
      mode: 'playhead';
      startX: number;
    }
  | {
      mode: 'move';
      track: TrackType;
      id: string;
      startX: number;
      lastDeltaApplied: number;
    }
  | {
      mode: 'trim-start' | 'trim-end';
      track: TrackType;
      id: string;
      startX: number;
      initialStart: number;
      initialEnd: number;
    };

export const TimelineEditor: React.FC<TimelineEditorProps> = ({
  project,
  currentTime,
  selected,
  onSeek,
  onSelect,
  onAddTrackItem,
  onShiftItem,
  onTrimItem,
  onSplitActiveClip,
}) => {
  const [pxPerSec, setPxPerSec] = useState<number>(64);
  const tracksScrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const duration = Math.max(5, project.meta.duration);
  const timelineWidth = Math.max(820, Math.ceil(duration * pxPerSec) + 80);

  const timeFromClientX = (clientX: number): number => {
    const el = tracksScrollRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    return roundTime(Math.max(0, Math.min(duration, x / pxPerSec)));
  };

  const handleRulerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { mode: 'playhead', startX: e.clientX };
    onSeek(timeFromClientX(e.clientX));
  };

  const handleRulerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.mode === 'playhead') {
      onSeek(timeFromClientX(e.clientX));
    }
  };

  const handleRulerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.mode === 'playhead') {
      dragRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    }
  };

  const handleItemPointerDown = (
    e: React.PointerEvent<HTMLElement>,
    track: TrackType,
    id: string,
    startTime: number,
    endTime: number,
    mode: 'move' | 'trim-start' | 'trim-end'
  ) => {
    e.stopPropagation();
    onSelect({ track, id });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (mode === 'move') {
      dragRef.current = {
        mode: 'move',
        track,
        id,
        startX: e.clientX,
        lastDeltaApplied: 0,
      };
    } else {
      dragRef.current = {
        mode,
        track,
        id,
        startX: e.clientX,
        initialStart: startTime,
        initialEnd: endTime,
      };
    }
  };

  const handleItemPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.mode === 'playhead') return;

    const totalDeltaSec = (e.clientX - drag.startX) / pxPerSec;
    if (drag.mode === 'move') {
      const incremental = roundTime(totalDeltaSec - drag.lastDeltaApplied);
      if (Math.abs(incremental) >= 0.05) {
        onShiftItem(drag.track, drag.id, incremental);
        drag.lastDeltaApplied = roundTime(drag.lastDeltaApplied + incremental);
      }
    } else if (drag.mode === 'trim-start') {
      const nextStart = roundTime(
        Math.max(0, Math.min(drag.initialEnd - 0.25, drag.initialStart + totalDeltaSec))
      );
      onTrimItem(drag.track, drag.id, 'start', nextStart);
    } else if (drag.mode === 'trim-end') {
      const nextEnd = roundTime(
        Math.min(duration, Math.max(drag.initialStart + 0.25, drag.initialEnd + totalDeltaSec))
      );
      onTrimItem(drag.track, drag.id, 'end', nextEnd);
    }
  };

  const handleItemPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    if (dragRef.current && dragRef.current.mode !== 'playhead') {
      dragRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    }
  };

  // Build time ruler ticks every 1s or 2s depending on zoom
  const tickStep = pxPerSec >= 55 ? 1 : 2;
  const ticks: number[] = [];
  for (let s = 0; s <= Math.ceil(duration); s += tickStep) {
    ticks.push(s);
  }

  const playheadLeft = currentTime * pxPerSec;

  const canSplitClip = project.tracks.clips.some(
    (c) => currentTime > c.startTime + 0.25 && currentTime < c.endTime - 0.25
  );

  return (
    <section
      aria-label="Multi-Track Timeline Editor"
      className="h-[244px] shrink-0 bg-[#12151C] border-t border-[#252A36] flex flex-col select-none"
    >
      {/* Timeline Toolbar */}
      <div className="h-9 px-4 border-b border-[#252A36] flex items-center justify-between gap-4 bg-[#151922] shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-200">Timeline</span>
          <span className="text-xs font-mono-tabular text-slate-400">
            Playhead {formatTimecode(currentTime)}
          </span>
          <button
            type="button"
            onClick={onSplitActiveClip}
            disabled={!canSplitClip}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium bg-[#1C212D] hover:bg-[#252C3B] disabled:opacity-40 text-slate-200 border border-[#2C3344] cursor-pointer disabled:cursor-not-allowed"
          >
            <Scissors className="w-3 h-3" />
            <span>Split Clip</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Zoom out timeline"
            onClick={() => setPxPerSec((z) => Math.max(28, z - 12))}
            className="p-1 rounded hover:bg-[#232938] text-slate-300 cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-mono-tabular text-slate-400 w-12 text-center">
            {pxPerSec}px/s
          </span>
          <button
            type="button"
            aria-label="Zoom in timeline"
            onClick={() => setPxPerSec((z) => Math.min(120, z + 12))}
            className="p-1 rounded hover:bg-[#232938] text-slate-300 cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Track Headers + Scrollable Time Grid */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Track Header Column */}
        <div className="w-[152px] shrink-0 bg-[#131720] border-r border-[#252A36] flex flex-col">
          {/* Ruler corner spacer */}
          <div className="h-7 border-b border-[#252A36] px-3 flex items-center text-[11px] text-slate-500 font-mono-tabular">
            Tracks
          </div>

          {/* Track 1 Header: Video Clips */}
          <div className="h-[54px] px-3 border-b border-[#1E232F] flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Film className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="text-xs font-medium text-slate-200 truncate">
                Video Clips
              </span>
            </div>
            <button
              type="button"
              onClick={() => onAddTrackItem('clips')}
              aria-label="Add video clip segment"
              className="p-1 rounded hover:bg-[#232938] text-slate-400 hover:text-white cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Track 2 Header: Captions */}
          <div className="h-[54px] px-3 border-b border-[#1E232F] flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <TypeIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-xs font-medium text-slate-200 truncate">
                Captions
              </span>
            </div>
            <button
              type="button"
              onClick={() => onAddTrackItem('captions')}
              aria-label="Add caption item"
              className="p-1 rounded hover:bg-[#232938] text-slate-400 hover:text-white cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Track 3 Header: B-Roll */}
          <div className="h-[54px] px-3 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <ImageIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-xs font-medium text-slate-200 truncate">
                B-Roll
              </span>
            </div>
            <button
              type="button"
              onClick={() => onAddTrackItem('brolls')}
              aria-label="Add B-roll item"
              className="p-1 rounded hover:bg-[#232938] text-slate-400 hover:text-white cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right Scrollable Tracks Canvas */}
        <div
          ref={tracksScrollRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative bg-[#0D1016]"
        >
          <div
            className="relative h-full"
            style={{ width: `${timelineWidth}px` }}
          >
            {/* Time Ruler (Click/Drag to scrub) */}
            <div
              role="slider"
              tabIndex={0}
              aria-label="Timeline playhead scrubber"
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={currentTime}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') onSeek(Math.min(duration, currentTime + 0.5));
                if (e.key === 'ArrowLeft') onSeek(Math.max(0, currentTime - 0.5));
              }}
              onPointerDown={handleRulerPointerDown}
              onPointerMove={handleRulerPointerMove}
              onPointerUp={handleRulerPointerUp}
              className="h-7 border-b border-[#252A36] bg-[#141821] relative cursor-ew-resize"
            >
              {ticks.map((sec) => (
                <div
                  key={sec}
                  className="absolute top-0 bottom-0 flex flex-col justify-end pointer-events-none"
                  style={{ left: `${sec * pxPerSec}px` }}
                >
                  <span className="text-[10px] font-mono-tabular text-slate-400 pl-1 pb-0.5">
                    {sec}s
                  </span>
                  <div className="w-px h-1.5 bg-[#363F52]" />
                </div>
              ))}
            </div>

            {/* Track 1: Video Clips */}
            <div className="h-[54px] border-b border-[#1A1F2B] relative">
              {project.tracks.clips.map((clip) => {
                const isSelected =
                  selected?.track === 'clips' && selected.id === clip.id;
                const left = clip.startTime * pxPerSec;
                const width = Math.max(
                  26,
                  (clip.endTime - clip.startTime) * pxPerSec
                );
                return (
                  <div
                    key={clip.id}
                    style={{ left: `${left}px`, width: `${width}px` }}
                    className={`absolute top-1.5 bottom-1.5 rounded-md border flex items-center overflow-hidden transition-colors ${
                      isSelected
                        ? 'bg-sky-500/25 border-sky-400 ring-1 ring-sky-400/50'
                        : 'bg-sky-500/15 border-sky-500/40 hover:border-sky-400/80'
                    }`}
                  >
                    <button
                      type="button"
                      aria-label={`Trim start of clip ${clip.label}`}
                      onPointerDown={(e) =>
                        handleItemPointerDown(
                          e,
                          'clips',
                          clip.id,
                          clip.startTime,
                          clip.endTime,
                          'trim-start'
                        )
                      }
                      onPointerMove={handleItemPointerMove}
                      onPointerUp={handleItemPointerUp}
                      className="w-2 h-full shrink-0 cursor-ew-resize bg-sky-400/30 hover:bg-sky-400/70"
                    />
                    <button
                      type="button"
                      aria-label={`Select clip ${clip.label}`}
                      onClick={() => onSelect({ track: 'clips', id: clip.id })}
                      onPointerDown={(e) =>
                        handleItemPointerDown(
                          e,
                          'clips',
                          clip.id,
                          clip.startTime,
                          clip.endTime,
                          'move'
                        )
                      }
                      onPointerMove={handleItemPointerMove}
                      onPointerUp={handleItemPointerUp}
                      className="flex-1 h-full px-2 text-left flex items-center justify-between gap-1.5 min-w-0 cursor-grab active:cursor-grabbing"
                    >
                      <span className="text-xs font-medium text-sky-100 truncate">
                        {clip.label}
                      </span>
                      {clip.autoMotion && (
                        <span className="text-[10px] font-mono-tabular text-sky-300 shrink-0">
                          {clip.motionPreset}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label={`Trim end of clip ${clip.label}`}
                      onPointerDown={(e) =>
                        handleItemPointerDown(
                          e,
                          'clips',
                          clip.id,
                          clip.startTime,
                          clip.endTime,
                          'trim-end'
                        )
                      }
                      onPointerMove={handleItemPointerMove}
                      onPointerUp={handleItemPointerUp}
                      className="w-2 h-full shrink-0 cursor-ew-resize bg-sky-400/30 hover:bg-sky-400/70"
                    />
                  </div>
                );
              })}
            </div>

            {/* Track 2: Captions */}
            <div className="h-[54px] border-b border-[#1A1F2B] relative">
              {project.tracks.captions.map((cap) => {
                const isSelected =
                  selected?.track === 'captions' && selected.id === cap.id;
                const left = cap.startTime * pxPerSec;
                const width = Math.max(26, (cap.endTime - cap.startTime) * pxPerSec);
                return (
                  <div
                    key={cap.id}
                    style={{ left: `${left}px`, width: `${width}px` }}
                    className={`absolute top-1.5 bottom-1.5 rounded-md border flex items-center overflow-hidden transition-colors ${
                      isSelected
                        ? 'bg-amber-500/25 border-amber-400 ring-1 ring-amber-400/50'
                        : 'bg-amber-500/15 border-amber-500/40 hover:border-amber-400/80'
                    }`}
                  >
                    <button
                      type="button"
                      aria-label={`Trim start of caption ${cap.text}`}
                      onPointerDown={(e) =>
                        handleItemPointerDown(
                          e,
                          'captions',
                          cap.id,
                          cap.startTime,
                          cap.endTime,
                          'trim-start'
                        )
                      }
                      onPointerMove={handleItemPointerMove}
                      onPointerUp={handleItemPointerUp}
                      className="w-2 h-full shrink-0 cursor-ew-resize bg-amber-400/30 hover:bg-amber-400/70"
                    />
                    <button
                      type="button"
                      aria-label={`Select caption ${cap.text}`}
                      onClick={() => onSelect({ track: 'captions', id: cap.id })}
                      onPointerDown={(e) =>
                        handleItemPointerDown(
                          e,
                          'captions',
                          cap.id,
                          cap.startTime,
                          cap.endTime,
                          'move'
                        )
                      }
                      onPointerMove={handleItemPointerMove}
                      onPointerUp={handleItemPointerUp}
                      className="flex-1 h-full px-2 text-left flex items-center min-w-0 cursor-grab active:cursor-grabbing"
                    >
                      <span className="text-xs font-medium text-amber-100 truncate">
                        {cap.text}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Trim end of caption ${cap.text}`}
                      onPointerDown={(e) =>
                        handleItemPointerDown(
                          e,
                          'captions',
                          cap.id,
                          cap.startTime,
                          cap.endTime,
                          'trim-end'
                        )
                      }
                      onPointerMove={handleItemPointerMove}
                      onPointerUp={handleItemPointerUp}
                      className="w-2 h-full shrink-0 cursor-ew-resize bg-amber-400/30 hover:bg-amber-400/70"
                    />
                  </div>
                );
              })}
            </div>

            {/* Track 3: B-Roll */}
            <div className="h-[54px] relative">
              {project.tracks.brolls.map((br) => {
                const isSelected =
                  selected?.track === 'brolls' && selected.id === br.id;
                const left = br.startTime * pxPerSec;
                const width = Math.max(26, (br.endTime - br.startTime) * pxPerSec);
                return (
                  <div
                    key={br.id}
                    style={{ left: `${left}px`, width: `${width}px` }}
                    className={`absolute top-1.5 bottom-1.5 rounded-md border flex items-center overflow-hidden transition-colors ${
                      isSelected
                        ? 'bg-emerald-500/25 border-emerald-400 ring-1 ring-emerald-400/50'
                        : 'bg-emerald-500/15 border-emerald-500/40 hover:border-emerald-400/80'
                    }`}
                  >
                    <button
                      type="button"
                      aria-label={`Trim start of B-roll ${br.keyword}`}
                      onPointerDown={(e) =>
                        handleItemPointerDown(
                          e,
                          'brolls',
                          br.id,
                          br.startTime,
                          br.endTime,
                          'trim-start'
                        )
                      }
                      onPointerMove={handleItemPointerMove}
                      onPointerUp={handleItemPointerUp}
                      className="w-2 h-full shrink-0 cursor-ew-resize bg-emerald-400/30 hover:bg-emerald-400/70"
                    />
                    <button
                      type="button"
                      aria-label={`Select B-roll ${br.keyword}`}
                      onClick={() => onSelect({ track: 'brolls', id: br.id })}
                      onPointerDown={(e) =>
                        handleItemPointerDown(
                          e,
                          'brolls',
                          br.id,
                          br.startTime,
                          br.endTime,
                          'move'
                        )
                      }
                      onPointerMove={handleItemPointerMove}
                      onPointerUp={handleItemPointerUp}
                      className="flex-1 h-full px-2 text-left flex items-center justify-between gap-1.5 min-w-0 cursor-grab active:cursor-grabbing"
                    >
                      <span className="text-xs font-medium text-emerald-100 truncate">
                        {br.keyword}
                      </span>
                      <span className="text-[10px] font-mono-tabular text-emerald-300 shrink-0">
                        {br.displayMode}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Trim end of B-roll ${br.keyword}`}
                      onPointerDown={(e) =>
                        handleItemPointerDown(
                          e,
                          'brolls',
                          br.id,
                          br.startTime,
                          br.endTime,
                          'trim-end'
                        )
                      }
                      onPointerMove={handleItemPointerMove}
                      onPointerUp={handleItemPointerUp}
                      className="w-2 h-full shrink-0 cursor-ew-resize bg-emerald-400/30 hover:bg-emerald-400/70"
                    />
                  </div>
                );
              })}
            </div>

            {/* Playhead Vertical Needle */}
            <div
              className="absolute top-0 bottom-0 w-px bg-rose-500 pointer-events-none z-20"
              style={{ left: `${playheadLeft}px` }}
            >
              <div className="w-3 h-3 -ml-[5.5px] bg-rose-500 rounded-b-sm" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
