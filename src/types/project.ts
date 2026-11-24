export type AspectRatio = '9:16';

export type TrackType = 'clips' | 'captions' | 'brolls';

export type MotionPreset = 'zoom-in' | 'zoom-out' | 'ken-burns-pan' | 'none';

export type BRollDisplayMode = 'pip' | 'fullscreen-cutaway' | 'top-split';

export interface ProjectMeta {
  title: string;
  aspectRatio: AspectRatio;
  duration: number;
  videoSourceUrl: string | null;
  videoFileName?: string;
  sourceType: 'upload' | 'sample' | 'none';
}

export interface ClipSegment {
  id: string;
  label: string;
  startTime: number;
  endTime: number;
  sourceOffset: number;
  autoMotion: boolean;
  motionPreset: MotionPreset;
  motionIntensity: number;
  viralityNote?: string;
}

export interface CaptionItem {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  fontSize: number;
  color: string;
  highlightColor: string;
  backgroundColor: string;
  positionX: number;
  positionY: number;
  activeWordHighlight: boolean;
}

export interface BRollItem {
  id: string;
  keyword: string;
  prompt?: string;
  startTime: number;
  endTime: number;
  opacity: number;
  scale: number;
  positionX: number;
  positionY: number;
  mediaUrl?: string;
  displayMode: BRollDisplayMode;
}

export interface ProjectTracks {
  clips: ClipSegment[];
  captions: CaptionItem[];
  brolls: BRollItem[];
}

export interface ProjectState {
  meta: ProjectMeta;
  tracks: ProjectTracks;
}

export interface SelectedLayer {
  track: TrackType;
  id: string;
}

export interface AnalysisProgress {
  status: 'idle' | 'preparing' | 'analyzing' | 'done' | 'error';
  message?: string;
}
