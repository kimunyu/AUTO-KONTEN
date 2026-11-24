import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { AdapterModal } from './components/AdapterModal';
import { ExportModal } from './components/ExportModal';
import { InspectorPanel } from './components/InspectorPanel';
import { PreviewPlayer } from './components/PreviewPlayer';
import { TimelineEditor } from './components/TimelineEditor';
import { TopBar } from './components/TopBar';
import {
  moduleRegistry,
  type ExternalModuleProvider,
} from './services/externalAdapter';
import { probeMediaDuration } from './services/geminiAnalyzer';
import type {
  AnalysisProgress,
  BRollItem,
  CaptionItem,
  ClipSegment,
  ProjectState,
  SelectedLayer,
  TrackType,
} from './types/project';
import {
  addTrackItem,
  deleteTrackItem,
  shiftTrackItem,
  splitClipAtTime,
  updateBRollItem,
  updateCaptionItem,
  updateClipItem,
} from './utils/projectOps';
import { createSampleProjectState } from './utils/sampleProject';

export default function App() {
  const [project, setProject] = useState<ProjectState>(() =>
    createSampleProjectState()
  );
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(1.2);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [selected, setSelected] = useState<SelectedLayer | null>({
    track: 'captions',
    id: 'cap-1',
  });
  const [languageHint, setLanguageHint] = useState<string>(
    'Indonesian & English'
  );
  const [analysis, setAnalysis] = useState<AnalysisProgress>({
    status: 'idle',
  });
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [showAdapterModal, setShowAdapterModal] = useState<boolean>(false);
  const [providers, setProviders] = useState<ExternalModuleProvider[]>(() =>
    moduleRegistry.getProviders()
  );
  const [activeProviderId, setActiveProviderId] = useState<string>(
    () => moduleRegistry.getActiveProvider().id
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenUploadRef = useRef<HTMLInputElement>(null);
  const activeBlobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (activeBlobUrlRef.current) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
      }
    };
  }, []);

  // Spacebar play/pause shortcut when focus is outside form inputs
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleUploadVideo = useCallback(async (file: File) => {
    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
    }
    const objectUrl = URL.createObjectURL(file);
    activeBlobUrlRef.current = objectUrl;

    setUploadedFile(file);
    setIsPlaying(false);
    setCurrentTime(0);

    const probed = await probeMediaDuration(file);
    const cleanTitle = file.name.replace(/\.[^.]+$/, '') || 'Uploaded Short';
    const nextDuration = probed && probed > 0 ? Math.round(probed * 10) / 10 : 18;

    setProject((prev) => ({
      meta: {
        ...prev.meta,
        title: cleanTitle,
        duration: nextDuration,
        videoSourceUrl: objectUrl,
        videoFileName: file.name,
        sourceType: 'upload',
      },
      tracks: {
        clips: [
          {
            id: 'clip-1',
            label: 'Full Clip',
            startTime: 0,
            endTime: nextDuration,
            sourceOffset: 0,
            autoMotion: true,
            motionPreset: 'zoom-in',
            motionIntensity: 1.1,
          },
        ],
        captions: [],
        brolls: [],
      },
    }));
    setSelected({ track: 'clips', id: 'clip-1' });
    setAnalysis({ status: 'idle' });
  }, []);

  const handleDurationDetected = useCallback((detectedDuration: number) => {
    const rounded = Math.round(detectedDuration * 10) / 10;
    if (rounded <= 0) return;
    setProject((prev) => {
      if (Math.abs(prev.meta.duration - rounded) < 0.2) return prev;
      return {
        ...prev,
        meta: { ...prev.meta, duration: rounded },
        tracks: {
          ...prev.tracks,
          clips:
            prev.tracks.clips.length === 1 &&
            prev.tracks.clips[0].startTime === 0
              ? [{ ...prev.tracks.clips[0], endTime: rounded }]
              : prev.tracks.clips,
        },
      };
    });
  }, []);

  const handleLoadSample = useCallback(() => {
    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
    }
    setUploadedFile(null);
    setProject(createSampleProjectState());
    setCurrentTime(1.2);
    setIsPlaying(false);
    setSelected({ track: 'captions', id: 'cap-1' });
    setAnalysis({ status: 'idle' });
  }, []);

  const handleAnalyzeWithAI = useCallback(async () => {
    const activeProvider = moduleRegistry.getActiveProvider();
    if (!activeProvider.analyzeMedia) {
      setAnalysis({
        status: 'error',
        message: `Active adapter "${activeProvider.name}" does not support media analysis.`,
      });
      return;
    }

    setAnalysis({
      status: 'analyzing',
      message: `Analyzing media with ${activeProvider.name}...`,
    });

    try {
      const tracks = await activeProvider.analyzeMedia({
        file: uploadedFile,
        fileName: project.meta.videoFileName || 'sample_reel.mp4',
        mimeType: uploadedFile?.type || 'video/mp4',
        duration: project.meta.duration,
        title: project.meta.title,
        languageHint,
        contextNotes:
          'Short-form creator tutorial in Indonesian & English covering AI video hooks, dynamic word captions, and B-roll cues.',
      });

      setProject((prev) => ({
        ...prev,
        tracks,
      }));

      if (tracks.captions.length > 0) {
        setSelected({ track: 'captions', id: tracks.captions[0].id });
      } else if (tracks.clips.length > 0) {
        setSelected({ track: 'clips', id: tracks.clips[0].id });
      }

      setAnalysis({
        status: 'done',
        message: `Generated ${tracks.clips.length} clips, ${tracks.captions.length} captions, and ${tracks.brolls.length} B-roll cues. Every layer is editable below.`,
      });
    } catch (err) {
      setAnalysis({
        status: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Analysis failed. Verify your Gemini API key or media format.',
      });
    }
  }, [uploadedFile, project.meta, languageHint]);

  const handleAddTrackItem = useCallback(
    (track: TrackType) => {
      setProject((prev) => {
        const { nextState, createdId } = addTrackItem(prev, track, currentTime);
        setSelected({ track, id: createdId });
        return nextState;
      });
    },
    [currentTime]
  );

  const handleShiftItem = useCallback(
    (track: TrackType, id: string, deltaSeconds: number) => {
      setProject((prev) => shiftTrackItem(prev, track, id, deltaSeconds));
    },
    []
  );

  const handleTrimItem = useCallback(
    (
      track: TrackType,
      id: string,
      edge: 'start' | 'end',
      newTime: number
    ) => {
      setProject((prev) => {
        const patch =
          edge === 'start' ? { startTime: newTime } : { endTime: newTime };
        if (track === 'clips') return updateClipItem(prev, id, patch);
        if (track === 'captions') return updateCaptionItem(prev, id, patch);
        return updateBRollItem(prev, id, patch);
      });
    },
    []
  );

  const handleSplitActiveClip = useCallback(
    (explicitId?: string) => {
      setProject((prev) => {
        const target = explicitId
          ? prev.tracks.clips.find((c) => c.id === explicitId)
          : prev.tracks.clips.find(
              (c) =>
                currentTime > c.startTime + 0.25 &&
                currentTime < c.endTime - 0.25
            );
        if (!target) return prev;
        return splitClipAtTime(prev, target.id, currentTime);
      });
    },
    [currentTime]
  );

  const handleDeleteLayer = useCallback((layer: SelectedLayer) => {
    setProject((prev) => deleteTrackItem(prev, layer.track, layer.id));
    setSelected(null);
  }, []);

  const handleResolveBRollWithAdapter = useCallback(
    async (brollId: string, keyword: string) => {
      const provider = moduleRegistry.getActiveProvider();
      if (!provider.resolveBRollMedia) return;
      try {
        const asset = await provider.resolveBRollMedia(keyword);
        if (asset?.mediaUrl) {
          setProject((prev) =>
            updateBRollItem(prev, brollId, { mediaUrl: asset.mediaUrl })
          );
        }
      } catch (err) {
        setAnalysis({
          status: 'error',
          message:
            err instanceof Error ? err.message : 'Failed to resolve B-Roll asset.',
        });
      }
    },
    []
  );

  const activeProvider =
    providers.find((p) => p.id === activeProviderId) ?? providers[0];

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0B0D11] text-slate-100 flex flex-col">
      {/* Hidden input for empty-stage upload trigger */}
      <input
        ref={hiddenUploadRef}
        type="file"
        accept="video/*,audio/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUploadVideo(f);
          e.target.value = '';
        }}
      />

      {/* Top Studio Header */}
      <TopBar
        meta={project.meta}
        clipCount={project.tracks.clips.length}
        captionCount={project.tracks.captions.length}
        brollCount={project.tracks.brolls.length}
        analysis={analysis}
        activeProviderName={activeProvider?.name || 'Built-in'}
        onTitleChange={(title) =>
          setProject((prev) => ({
            ...prev,
            meta: { ...prev.meta, title },
          }))
        }
        onUploadVideo={handleUploadVideo}
        onAnalyze={handleAnalyzeWithAI}
        onOpenExport={() => setShowExportModal(true)}
        onOpenAdapter={() => setShowAdapterModal(true)}
      />

      {/* Analysis Status Banner (Error or Success) */}
      {(analysis.status === 'error' || analysis.status === 'done') &&
        analysis.message && (
          <div
            role="status"
            className={`px-4 py-2 text-xs flex items-center justify-between gap-3 border-b shrink-0 ${
              analysis.status === 'error'
                ? 'bg-rose-950/60 border-rose-500/30 text-rose-200'
                : 'bg-emerald-950/50 border-emerald-500/30 text-emerald-200'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {analysis.status === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span className="truncate">{analysis.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setAnalysis({ status: 'idle' })}
              aria-label="Dismiss status message"
              className="p-0.5 rounded hover:bg-white/10 cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

      {/* Center Workspace: 9:16 Preview Player (left) + Context Inspector (right) */}
      <main className="flex-1 min-h-0 flex overflow-hidden">
        <PreviewPlayer
          project={project}
          currentTime={currentTime}
          isPlaying={isPlaying}
          isMuted={isMuted}
          selected={selected}
          onTimeUpdate={setCurrentTime}
          onTogglePlay={() => setIsPlaying((p) => !p)}
          onToggleMute={() => setIsMuted((m) => !m)}
          onSelectLayer={setSelected}
          onQuickAddCaption={() => handleAddTrackItem('captions')}
          onQuickAddBRoll={() => handleAddTrackItem('brolls')}
          onUploadRequest={() => hiddenUploadRef.current?.click()}
          onLoadSample={handleLoadSample}
          onDurationDetected={handleDurationDetected}
          canvasRefExternal={canvasRef}
        />

        <InspectorPanel
          project={project}
          selected={selected}
          currentTime={currentTime}
          languageHint={languageHint}
          canResolveBRoll={Boolean(activeProvider?.resolveBRollMedia)}
          onLanguageHintChange={setLanguageHint}
          onUpdateClip={(id: string, patch: Partial<ClipSegment>) =>
            setProject((prev) => updateClipItem(prev, id, patch))
          }
          onUpdateCaption={(id: string, patch: Partial<CaptionItem>) =>
            setProject((prev) => updateCaptionItem(prev, id, patch))
          }
          onUpdateBRoll={(id: string, patch: Partial<BRollItem>) =>
            setProject((prev) => updateBRollItem(prev, id, patch))
          }
          onSplitClip={(id: string) => handleSplitActiveClip(id)}
          onDeleteLayer={handleDeleteLayer}
          onSeekToTime={(time: number) => {
            setIsPlaying(false);
            setCurrentTime(Math.min(project.meta.duration, Math.max(0, time)));
          }}
          onResolveBRollWithAdapter={handleResolveBRollWithAdapter}
        />
      </main>

      {/* Bottom Workspace: Multi-Track Timeline Editor */}
      <TimelineEditor
        project={project}
        currentTime={currentTime}
        selected={selected}
        onSeek={(time) => {
          setIsPlaying(false);
          setCurrentTime(time);
        }}
        onSelect={setSelected}
        onAddTrackItem={handleAddTrackItem}
        onShiftItem={handleShiftItem}
        onTrimItem={handleTrimItem}
        onSplitActiveClip={() => handleSplitActiveClip()}
      />

      {/* Export JSON / Render 9:16 Modal */}
      {showExportModal && (
        <ExportModal
          project={project}
          canvasRef={canvasRef}
          onStartRenderPlayback={() => {
            setCurrentTime(0);
            setIsPlaying(true);
          }}
          onStopRenderPlayback={() => {
            setIsPlaying(false);
            setCurrentTime(0);
          }}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {/* External Module Adapter Modal */}
      {showAdapterModal && (
        <AdapterModal
          providers={providers}
          activeProviderId={activeProviderId}
          onSelectProvider={(id) => {
            moduleRegistry.setActiveProvider(id);
            setActiveProviderId(id);
          }}
          onRegisterProvider={(provider) => {
            moduleRegistry.registerProvider(provider, true);
            setProviders(moduleRegistry.getProviders());
            setActiveProviderId(provider.id);
          }}
          onClose={() => setShowAdapterModal(false)}
        />
      )}
    </div>
  );
}
