import type {
  BRollItem,
  CaptionItem,
  ClipSegment,
  ProjectState,
  ProjectTracks,
  TrackType,
} from '../types/project';

export const MIN_ITEM_DURATION = 0.25;

export function roundTime(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatTimecode(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.floor((safe - Math.floor(safe)) * 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

export function clampTimeRange(
  startTime: number,
  endTime: number,
  maxDuration: number,
  minLength: number = MIN_ITEM_DURATION
): { startTime: number; endTime: number } {
  const safeMax = Math.max(minLength, maxDuration);
  let start = Math.max(0, Math.min(startTime, safeMax - minLength));
  let end = Math.max(start + minLength, Math.min(endTime, safeMax));
  if (end - start < minLength) {
    end = Math.min(safeMax, start + minLength);
    start = Math.max(0, end - minLength);
  }
  return {
    startTime: roundTime(start),
    endTime: roundTime(end),
  };
}

export interface ActiveLayersAtTime {
  clip: ClipSegment | null;
  caption: CaptionItem | null;
  broll: BRollItem | null;
}

export function getActiveItemsAtTime(
  tracks: ProjectTracks,
  currentTime: number
): ActiveLayersAtTime {
  const t = Math.max(0, currentTime);
  const clip =
    tracks.clips.find((c) => t >= c.startTime && t < c.endTime) ??
    tracks.clips.find((c) => Math.abs(t - c.endTime) < 0.001 && t === c.endTime) ??
    null;
  const caption =
    tracks.captions.find((cap) => t >= cap.startTime && t <= cap.endTime) ?? null;
  const broll =
    tracks.brolls.find((br) => t >= br.startTime && t <= br.endTime) ?? null;

  return { clip, caption, broll };
}

export interface MotionTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

function easeInOutCubic(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function computeAutoMotionTransform(
  clip: ClipSegment | null,
  currentTime: number
): MotionTransform {
  if (!clip || !clip.autoMotion || clip.motionPreset === 'none') {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }

  const span = Math.max(0.1, clip.endTime - clip.startTime);
  const rawProgress = (currentTime - clip.startTime) / span;
  const progress = easeInOutCubic(rawProgress);
  const peak = Math.max(1.01, Math.min(1.4, clip.motionIntensity || 1.12));

  switch (clip.motionPreset) {
    case 'zoom-in':
      return {
        scale: roundTime(1 + (peak - 1) * progress),
        offsetX: 0,
        offsetY: 0,
      };
    case 'zoom-out':
      return {
        scale: roundTime(peak - (peak - 1) * progress),
        offsetX: 0,
        offsetY: 0,
      };
    case 'ken-burns-pan': {
      const scale = roundTime(1 + (peak - 1) * (0.4 + 0.6 * progress));
      const offsetX = roundTime((progress - 0.5) * 32);
      const offsetY = roundTime((0.5 - progress) * 18);
      return { scale, offsetX, offsetY };
    }
    default:
      return { scale: 1, offsetX: 0, offsetY: 0 };
  }
}

export function computeActiveWordIndex(
  caption: CaptionItem,
  currentTime: number
): number {
  const words = caption.text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return -1;
  const span = Math.max(0.05, caption.endTime - caption.startTime);
  const ratio = Math.max(0, Math.min(0.999, (currentTime - caption.startTime) / span));
  return Math.floor(ratio * words.length);
}

export function updateClipItem(
  state: ProjectState,
  id: string,
  patch: Partial<ClipSegment>
): ProjectState {
  const clips = state.tracks.clips.map((clip) => {
    if (clip.id !== id) return clip;
    const merged = { ...clip, ...patch };
    const clamped = clampTimeRange(
      merged.startTime,
      merged.endTime,
      Math.max(state.meta.duration, merged.endTime)
    );
    return { ...merged, ...clamped };
  });
  const maxEnd = clips.reduce((acc, c) => Math.max(acc, c.endTime), state.meta.duration);
  return {
    ...state,
    meta: { ...state.meta, duration: roundTime(maxEnd) },
    tracks: { ...state.tracks, clips },
  };
}

export function updateCaptionItem(
  state: ProjectState,
  id: string,
  patch: Partial<CaptionItem>
): ProjectState {
  const captions = state.tracks.captions.map((cap) => {
    if (cap.id !== id) return cap;
    const merged = { ...cap, ...patch };
    const clamped = clampTimeRange(
      merged.startTime,
      merged.endTime,
      Math.max(state.meta.duration, merged.endTime)
    );
    return {
      ...merged,
      ...clamped,
      fontSize: Math.max(20, Math.min(110, merged.fontSize)),
      positionX: Math.max(5, Math.min(95, merged.positionX)),
      positionY: Math.max(8, Math.min(92, merged.positionY)),
    };
  });
  return {
    ...state,
    tracks: { ...state.tracks, captions },
  };
}

export function updateBRollItem(
  state: ProjectState,
  id: string,
  patch: Partial<BRollItem>
): ProjectState {
  const brolls = state.tracks.brolls.map((br) => {
    if (br.id !== id) return br;
    const merged = { ...br, ...patch };
    const clamped = clampTimeRange(
      merged.startTime,
      merged.endTime,
      Math.max(state.meta.duration, merged.endTime)
    );
    return {
      ...merged,
      ...clamped,
      opacity: Math.max(0.1, Math.min(1, merged.opacity)),
      scale: Math.max(0.4, Math.min(1.5, merged.scale)),
      positionX: Math.max(10, Math.min(90, merged.positionX)),
      positionY: Math.max(10, Math.min(90, merged.positionY)),
    };
  });
  return {
    ...state,
    tracks: { ...state.tracks, brolls },
  };
}

export function shiftTrackItem(
  state: ProjectState,
  track: TrackType,
  id: string,
  deltaSeconds: number
): ProjectState {
  const duration = Math.max(1, state.meta.duration);

  const shiftRange = (startTime: number, endTime: number) => {
    const length = Math.max(MIN_ITEM_DURATION, endTime - startTime);
    const nextStart = Math.max(0, Math.min(duration - length, startTime + deltaSeconds));
    return {
      startTime: roundTime(nextStart),
      endTime: roundTime(nextStart + length),
    };
  };

  if (track === 'clips') {
    return {
      ...state,
      tracks: {
        ...state.tracks,
        clips: state.tracks.clips.map((c) =>
          c.id === id ? { ...c, ...shiftRange(c.startTime, c.endTime) } : c
        ),
      },
    };
  }
  if (track === 'captions') {
    return {
      ...state,
      tracks: {
        ...state.tracks,
        captions: state.tracks.captions.map((c) =>
          c.id === id ? { ...c, ...shiftRange(c.startTime, c.endTime) } : c
        ),
      },
    };
  }
  return {
    ...state,
    tracks: {
      ...state.tracks,
      brolls: state.tracks.brolls.map((b) =>
        b.id === id ? { ...b, ...shiftRange(b.startTime, b.endTime) } : b
      ),
    },
  };
}

export function splitClipAtTime(
  state: ProjectState,
  clipId: string,
  splitTime: number
): ProjectState {
  const target = state.tracks.clips.find((c) => c.id === clipId);
  if (!target) return state;
  if (
    splitTime <= target.startTime + MIN_ITEM_DURATION ||
    splitTime >= target.endTime - MIN_ITEM_DURATION
  ) {
    return state;
  }

  const splitPoint = roundTime(splitTime);
  const deltaSource = roundTime(splitPoint - target.startTime);

  const firstHalf: ClipSegment = {
    ...target,
    endTime: splitPoint,
  };
  const secondHalf: ClipSegment = {
    ...target,
    id: `${target.id}-split-${Math.round(splitPoint * 100)}`,
    label: `${target.label} (Part 2)`,
    startTime: splitPoint,
    sourceOffset: roundTime(target.sourceOffset + deltaSource),
    motionPreset: target.motionPreset === 'zoom-in' ? 'zoom-out' : 'zoom-in',
  };

  const clips = state.tracks.clips
    .flatMap((c) => (c.id === clipId ? [firstHalf, secondHalf] : [c]))
    .sort((a, b) => a.startTime - b.startTime);

  return {
    ...state,
    tracks: { ...state.tracks, clips },
  };
}

export function addTrackItem(
  state: ProjectState,
  track: TrackType,
  atTime: number
): { nextState: ProjectState; createdId: string } {
  const safeDuration = Math.max(5, state.meta.duration);
  const start = roundTime(Math.max(0, Math.min(safeDuration - 1.5, atTime)));
  const end = roundTime(Math.min(safeDuration, start + 2.5));
  const suffix = Date.now().toString(36).slice(-5);

  if (track === 'clips') {
    const id = `clip-${suffix}`;
    const item: ClipSegment = {
      id,
      label: `Clip ${state.tracks.clips.length + 1}`,
      startTime: start,
      endTime: end,
      sourceOffset: start,
      autoMotion: true,
      motionPreset: 'zoom-in',
      motionIntensity: 1.12,
    };
    return {
      createdId: id,
      nextState: {
        ...state,
        tracks: {
          ...state.tracks,
          clips: [...state.tracks.clips, item].sort((a, b) => a.startTime - b.startTime),
        },
      },
    };
  }

  if (track === 'captions') {
    const id = `cap-${suffix}`;
    const item: CaptionItem = {
      id,
      text: 'New dynamic caption',
      startTime: start,
      endTime: end,
      fontSize: 56,
      color: '#FFFFFF',
      highlightColor: '#FACC15',
      backgroundColor: 'rgba(11, 13, 17, 0.72)',
      positionX: 50,
      positionY: 74,
      activeWordHighlight: true,
    };
    return {
      createdId: id,
      nextState: {
        ...state,
        tracks: {
          ...state.tracks,
          captions: [...state.tracks.captions, item].sort(
            (a, b) => a.startTime - b.startTime
          ),
        },
      },
    };
  }

  const id = `broll-${suffix}`;
  const item: BRollItem = {
    id,
    keyword: 'cinematic workspace',
    prompt: 'Close-up creator studio desk lighting',
    startTime: start,
    endTime: end,
    opacity: 0.94,
    scale: 1,
    positionX: 50,
    positionY: 32,
    displayMode: 'pip',
  };
  return {
    createdId: id,
    nextState: {
      ...state,
      tracks: {
        ...state.tracks,
        brolls: [...state.tracks.brolls, item].sort((a, b) => a.startTime - b.startTime),
      },
    },
  };
}

export function deleteTrackItem(
  state: ProjectState,
  track: TrackType,
  id: string
): ProjectState {
  return {
    ...state,
    tracks: {
      ...state.tracks,
      clips:
        track === 'clips'
          ? state.tracks.clips.filter((c) => c.id !== id)
          : state.tracks.clips,
      captions:
        track === 'captions'
          ? state.tracks.captions.filter((c) => c.id !== id)
          : state.tracks.captions,
      brolls:
        track === 'brolls'
          ? state.tracks.brolls.filter((b) => b.id !== id)
          : state.tracks.brolls,
    },
  };
}

export function normalizeTracksFromAI(
  raw: {
    clips?: Array<Partial<ClipSegment>>;
    captions?: Array<Partial<CaptionItem>>;
    brolls?: Array<Partial<BRollItem>>;
  },
  duration: number
): ProjectTracks {
  const safeDuration = Math.max(1, duration);

  const clips: ClipSegment[] = (raw.clips ?? []).map((c, idx) => {
    const start = Number(c.startTime ?? idx * 4);
    const end = Number(c.endTime ?? start + 4);
    const clamped = clampTimeRange(start, end, safeDuration);
    return {
      id: c.id || `clip-ai-${idx + 1}`,
      label: (c.label || `Viral Hook ${idx + 1}`).trim(),
      startTime: clamped.startTime,
      endTime: clamped.endTime,
      sourceOffset: roundTime(Math.max(0, Number(c.sourceOffset ?? clamped.startTime))),
      autoMotion: c.autoMotion ?? true,
      motionPreset:
        c.motionPreset === 'zoom-out' ||
        c.motionPreset === 'ken-burns-pan' ||
        c.motionPreset === 'none'
          ? c.motionPreset
          : 'zoom-in',
      motionIntensity: Number(c.motionIntensity ?? 1.12),
      viralityNote: c.viralityNote,
    };
  });

  const captions: CaptionItem[] = (raw.captions ?? []).map((cap, idx) => {
    const start = Number(cap.startTime ?? idx * 2);
    const end = Number(cap.endTime ?? start + 2);
    const clamped = clampTimeRange(start, end, safeDuration);
    return {
      id: cap.id || `cap-ai-${idx + 1}`,
      text: (cap.text || '').trim() || `Caption ${idx + 1}`,
      startTime: clamped.startTime,
      endTime: clamped.endTime,
      fontSize: Number(cap.fontSize ?? 56),
      color: cap.color || '#FFFFFF',
      highlightColor: cap.highlightColor || '#FACC15',
      backgroundColor: cap.backgroundColor || 'rgba(11, 13, 17, 0.72)',
      positionX: Number(cap.positionX ?? 50),
      positionY: Number(cap.positionY ?? 75),
      activeWordHighlight: cap.activeWordHighlight ?? true,
    };
  });

  const brolls: BRollItem[] = (raw.brolls ?? []).map((br, idx) => {
    const start = Number(br.startTime ?? idx * 5);
    const end = Number(br.endTime ?? start + 2.5);
    const clamped = clampTimeRange(start, end, safeDuration);
    return {
      id: br.id || `broll-ai-${idx + 1}`,
      keyword: (br.keyword || 'visual cutaway').trim(),
      prompt: br.prompt,
      startTime: clamped.startTime,
      endTime: clamped.endTime,
      opacity: Number(br.opacity ?? 0.94),
      scale: Number(br.scale ?? 1),
      positionX: Number(br.positionX ?? 50),
      positionY: Number(br.positionY ?? 30),
      mediaUrl: br.mediaUrl,
      displayMode:
        br.displayMode === 'fullscreen-cutaway' || br.displayMode === 'top-split'
          ? br.displayMode
          : 'pip',
    };
  });

  return {
    clips: clips.sort((a, b) => a.startTime - b.startTime),
    captions: captions.sort((a, b) => a.startTime - b.startTime),
    brolls: brolls.sort((a, b) => a.startTime - b.startTime),
  };
}
