import React, { useEffect, useRef } from 'react';
import {
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipBack,
  SkipForward,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  BRollItem,
  CaptionItem,
  ClipSegment,
  ProjectState,
  SelectedLayer,
} from '../types/project';
import {
  computeActiveWordIndex,
  computeAutoMotionTransform,
  formatTimecode,
  getActiveItemsAtTime,
} from '../utils/projectOps';

interface PreviewPlayerProps {
  project: ProjectState;
  currentTime: number;
  isPlaying: boolean;
  isMuted: boolean;
  selected: SelectedLayer | null;
  onTimeUpdate: (time: number) => void;
  onTogglePlay: () => void;
  onToggleMute: () => void;
  onSelectLayer: (layer: SelectedLayer) => void;
  onQuickAddCaption: () => void;
  onQuickAddBRoll: () => void;
  onUploadRequest: () => void;
  onLoadSample: () => void;
  onDurationDetected?: (duration: number) => void;
  canvasRefExternal?: React.RefObject<HTMLCanvasElement | null>;
}

const CANVAS_W = 540;
const CANVAS_H = 960;

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawSampleStudioFrame(
  ctx: CanvasRenderingContext2D,
  t: number,
  clip: ClipSegment | null
) {
  // Clean deep slate studio backdrop
  const grad = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H);
  const phase = (Math.sin(t * 0.45) + 1) * 0.5;
  grad.addColorStop(0, '#0F172A');
  grad.addColorStop(0.55, phase > 0.5 ? '#162036' : '#1A243B');
  grad.addColorStop(1, '#090D16');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Subtle architectural lighting arc
  const glow = ctx.createRadialGradient(
    CANVAS_W * 0.5,
    CANVAS_H * 0.34,
    20,
    CANVAS_W * 0.5,
    CANVAS_H * 0.34,
    360
  );
  glow.addColorStop(0, 'rgba(56, 189, 248, 0.22)');
  glow.addColorStop(0.6, 'rgba(99, 102, 241, 0.08)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Subtle studio portrait framing silhouette (representing speaker in 9:16)
  ctx.save();
  ctx.fillStyle = 'rgba(226, 232, 240, 0.12)';
  // Head
  ctx.beginPath();
  ctx.arc(CANVAS_W / 2, CANVAS_H * 0.35, 68, 0, Math.PI * 2);
  ctx.fill();
  // Shoulders
  ctx.beginPath();
  ctx.ellipse(CANVAS_W / 2, CANVAS_H * 0.58, 155, 130, 0, Math.PI, Math.PI * 2);
  ctx.lineTo(CANVAS_W / 2 + 155, CANVAS_H * 0.72);
  ctx.lineTo(CANVAS_W / 2 - 155, CANVAS_H * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Animated studio audio spectrum bars in middle-lower frame
  const barCount = 24;
  const barWidth = 6;
  const gap = 8;
  const startX = (CANVAS_W - (barCount * barWidth + (barCount - 1) * gap)) / 2;
  const baseY = CANVAS_H * 0.56;
  ctx.fillStyle = 'rgba(56, 189, 248, 0.65)';
  for (let i = 0; i < barCount; i++) {
    const wave =
      Math.abs(Math.sin(t * 4.2 + i * 0.55)) * 28 +
      Math.abs(Math.cos(t * 2.5 - i * 0.3)) * 14 +
      6;
    drawRoundedRect(
      ctx,
      startX + i * (barWidth + gap),
      baseY - wave / 2,
      barWidth,
      wave,
      3
    );
    ctx.fill();
  }

  // Subtle safe-zone reticle markers
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 1.5;
  const m = 28;
  const len = 18;
  ctx.beginPath();
  ctx.moveTo(m, m + len);
  ctx.lineTo(m, m);
  ctx.lineTo(m + len, m);
  ctx.moveTo(CANVAS_W - m - len, m);
  ctx.lineTo(CANVAS_W - m, m);
  ctx.lineTo(CANVAS_W - m, m + len);
  ctx.stroke();

  if (clip) {
    ctx.fillStyle = 'rgba(248, 250, 252, 0.55)';
    ctx.font = '500 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(clip.label, 38, 52);
  }
}

function drawBRollLayer(
  ctx: CanvasRenderingContext2D,
  broll: BRollItem,
  loadedImage: HTMLImageElement | null,
  isSelected: boolean
) {
  ctx.save();
  ctx.globalAlpha = Math.max(0.1, Math.min(1, broll.opacity));

  let boxX = 0;
  let boxY = 0;
  let boxW = CANVAS_W;
  let boxH = CANVAS_H;
  let radius = 0;

  if (broll.displayMode === 'top-split') {
    boxX = 0;
    boxY = 0;
    boxW = CANVAS_W;
    boxH = CANVAS_H * 0.48;
  } else if (broll.displayMode === 'pip') {
    boxW = 360 * broll.scale;
    boxH = 220 * broll.scale;
    boxX = (broll.positionX / 100) * CANVAS_W - boxW / 2;
    boxY = (broll.positionY / 100) * CANVAS_H - boxH / 2;
    radius = 18;
  }

  drawRoundedRect(ctx, boxX, boxY, boxW, boxH, radius);
  ctx.clip();

  if (loadedImage && loadedImage.complete && loadedImage.naturalWidth > 0) {
    const imgRatio = loadedImage.naturalWidth / loadedImage.naturalHeight;
    const boxRatio = boxW / boxH;
    let drawW = boxW;
    let drawH = boxH;
    let drawX = boxX;
    let drawY = boxY;
    if (imgRatio > boxRatio) {
      drawW = boxH * imgRatio;
      drawX = boxX - (drawW - boxW) / 2;
    } else {
      drawH = boxW / imgRatio;
      drawY = boxY - (drawH - boxH) / 2;
    }
    ctx.drawImage(loadedImage, drawX, drawY, drawW, drawH);
  } else {
    // Editorial cutaway placeholder visual showing keyword & prompt
    const bGrad = ctx.createLinearGradient(boxX, boxY, boxX + boxW, boxY + boxH);
    bGrad.addColorStop(0, '#064E3B');
    bGrad.addColorStop(1, '#0F172A');
    ctx.fillStyle = bGrad;
    ctx.fillRect(boxX, boxY, boxW, boxH);

    // Subtle diagonal lines
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.16)';
    ctx.lineWidth = 1;
    for (let x = boxX - boxH; x < boxX + boxW + boxH; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, boxY);
      ctx.lineTo(x + boxH * 0.5, boxY + boxH);
      ctx.stroke();
    }

    ctx.fillStyle = '#6EE7B7';
    ctx.font = '600 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('B-ROLL CUTAWAY', boxX + boxW / 2, boxY + boxH / 2 - 18);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(broll.keyword.slice(0, 32), boxX + boxW / 2, boxY + boxH / 2 + 12);

    if (broll.prompt) {
      ctx.fillStyle = 'rgba(226, 232, 240, 0.78)';
      ctx.font = '400 13px "DM Sans", sans-serif';
      ctx.fillText(
        broll.prompt.slice(0, 46),
        boxX + boxW / 2,
        boxY + boxH / 2 + 38
      );
    }
  }

  ctx.restore();

  // Selection frame indicator
  ctx.save();
  drawRoundedRect(ctx, boxX, boxY, boxW, boxH, radius);
  ctx.strokeStyle = isSelected ? '#10B981' : 'rgba(255,255,255,0.22)';
  ctx.lineWidth = isSelected ? 3 : 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawCaptionLayer(
  ctx: CanvasRenderingContext2D,
  caption: CaptionItem,
  currentTime: number,
  isSelected: boolean
) {
  const words = caption.text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return;

  const scaleFactor = 0.5; // map 1080p virtual font size cleanly onto 540x960 canvas
  const fontPx = Math.round(caption.fontSize * scaleFactor);
  ctx.save();
  ctx.font = `700 ${fontPx}px "Plus Jakarta Sans", system-ui, sans-serif`;
  ctx.textBaseline = 'middle';

  const maxLineWidth = CANVAS_W - 72;
  const lines: Array<Array<{ word: string; index: number }>> = [];
  let currentLine: Array<{ word: string; index: number }> = [];
  let lineWidth = 0;
  const spaceWidth = ctx.measureText(' ').width;

  words.forEach((word, index) => {
    const wWidth = ctx.measureText(word).width;
    if (currentLine.length > 0 && lineWidth + spaceWidth + wWidth > maxLineWidth) {
      lines.push(currentLine);
      currentLine = [{ word, index }];
      lineWidth = wWidth;
    } else {
      lineWidth += (currentLine.length > 0 ? spaceWidth : 0) + wWidth;
      currentLine.push({ word, index });
    }
  });
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  const lineHeight = fontPx * 1.28;
  const totalHeight = lines.length * lineHeight;
  const padX = 18;
  const padY = 12;

  const widestLine = lines.reduce((max, line) => {
    const text = line.map((l) => l.word).join(' ');
    return Math.max(max, ctx.measureText(text).width);
  }, 0);

  const centerX = (caption.positionX / 100) * CANVAS_W;
  const centerY = (caption.positionY / 100) * CANVAS_H;
  const bgW = widestLine + padX * 2;
  const bgH = totalHeight + padY * 2;
  const bgX = Math.max(12, Math.min(CANVAS_W - bgW - 12, centerX - bgW / 2));
  const bgY = Math.max(12, Math.min(CANVAS_H - bgH - 12, centerY - bgH / 2));

  // Background box
  ctx.fillStyle = caption.backgroundColor || 'rgba(11, 13, 17, 0.78)';
  drawRoundedRect(ctx, bgX, bgY, bgW, bgH, 12);
  ctx.fill();

  if (isSelected) {
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const activeWordIdx = caption.activeWordHighlight
    ? computeActiveWordIndex(caption, currentTime)
    : -1;

  lines.forEach((line, lineIdx) => {
    const lineText = line.map((l) => l.word).join(' ');
    const measuredLineW = ctx.measureText(lineText).width;
    let cursorX = bgX + (bgW - measuredLineW) / 2;
    const y = bgY + padY + lineHeight * (lineIdx + 0.5);

    line.forEach((item, wordInLineIdx) => {
      const isHighlighted = item.index === activeWordIdx;
      ctx.fillStyle = isHighlighted ? caption.highlightColor : caption.color;
      ctx.textAlign = 'left';

      // Subtle shadow for crisp legibility
      ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
      ctx.shadowBlur = 4;
      ctx.fillText(item.word, cursorX, y);
      ctx.shadowBlur = 0;

      cursorX += ctx.measureText(item.word).width;
      if (wordInLineIdx < line.length - 1) {
        cursorX += spaceWidth;
      }
    });
  });

  ctx.restore();
}

export const PreviewPlayer: React.FC<PreviewPlayerProps> = ({
  project,
  currentTime,
  isPlaying,
  isMuted,
  selected,
  onTimeUpdate,
  onTogglePlay,
  onToggleMute,
  onSelectLayer,
  onQuickAddCaption,
  onQuickAddBRoll,
  onUploadRequest,
  onLoadSample,
  onDurationDetected,
  canvasRefExternal,
}) => {
  const internalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = canvasRefExternal ?? internalCanvasRef;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const brollImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const rafRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  // Preload B-Roll image URLs cleanly
  useEffect(() => {
    for (const br of project.tracks.brolls) {
      if (br.mediaUrl && !brollImagesRef.current.has(br.mediaUrl)) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = br.mediaUrl;
        brollImagesRef.current.set(br.mediaUrl, img);
      }
    }
  }, [project.tracks.brolls]);

  // Sync HTML5 video play/pause & mute state
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !project.meta.videoSourceUrl) return;
    video.muted = isMuted;
    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying, isMuted, project.meta.videoSourceUrl]);

  // Seek HTML5 video when scrubbing while paused or jumping significantly
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !project.meta.videoSourceUrl) return;
    const diff = Math.abs(video.currentTime - currentTime);
    if (diff > 0.15) {
      video.currentTime = Math.min(currentTime, video.duration || currentTime);
    }
  }, [currentTime, project.meta.videoSourceUrl]);

  // Playback tick loop for sample mode or video sync
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    lastFrameTimeRef.current = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastFrameTimeRef.current) / 1000);
      lastFrameTimeRef.current = now;

      const video = videoRef.current;
      if (project.meta.videoSourceUrl && video && video.readyState >= 2) {
        if (video.ended || video.currentTime >= project.meta.duration) {
          onTimeUpdate(0);
          video.currentTime = 0;
        } else {
          onTimeUpdate(video.currentTime);
        }
      } else {
        const next = currentTimeRef.current + dt;
        if (next >= project.meta.duration) {
          onTimeUpdate(0);
        } else {
          onTimeUpdate(next);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, project.meta.duration, project.meta.videoSourceUrl, onTimeUpdate]);

  // Canvas compositor render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { clip, caption, broll } = getActiveItemsAtTime(
      project.tracks,
      currentTime
    );
    const motion = computeAutoMotionTransform(clip, currentTime);

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // 1. Base video or sample scene with Auto Motion transform
    ctx.save();
    ctx.translate(CANVAS_W / 2 + motion.offsetX, CANVAS_H / 2 + motion.offsetY);
    ctx.scale(motion.scale, motion.scale);
    ctx.translate(-CANVAS_W / 2, -CANVAS_H / 2);

    const video = videoRef.current;
    if (project.meta.videoSourceUrl && video && video.readyState >= 2) {
      const vw = video.videoWidth || CANVAS_W;
      const vh = video.videoHeight || CANVAS_H;
      const videoRatio = vw / vh;
      const canvasRatio = CANVAS_W / CANVAS_H;

      let drawW = CANVAS_W;
      let drawH = CANVAS_H;
      let drawX = 0;
      let drawY = 0;
      if (videoRatio > canvasRatio) {
        drawW = CANVAS_H * videoRatio;
        drawX = (CANVAS_W - drawW) / 2;
      } else {
        drawH = CANVAS_W / videoRatio;
        drawY = (CANVAS_H - drawH) / 2;
      }
      ctx.drawImage(video, drawX, drawY, drawW, drawH);
    } else if (project.meta.sourceType === 'sample') {
      drawSampleStudioFrame(ctx, currentTime, clip);
    } else {
      ctx.fillStyle = '#0B0D11';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
    ctx.restore();

    // 2. B-Roll overlay layer
    if (broll) {
      const img = broll.mediaUrl
        ? brollImagesRef.current.get(broll.mediaUrl) ?? null
        : null;
      const isBrollSelected =
        selected?.track === 'brolls' && selected.id === broll.id;
      drawBRollLayer(ctx, broll, img, isBrollSelected);
    }

    // 3. Real-time Caption layer
    if (caption) {
      const isCaptionSelected =
        selected?.track === 'captions' && selected.id === caption.id;
      drawCaptionLayer(ctx, caption, currentTime, isCaptionSelected);
    }
  }, [project, currentTime, selected, canvasRef]);

  const active = getActiveItemsAtTime(project.tracks, currentTime);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickYPercent = ((e.clientY - rect.top) / rect.height) * 100;

    if (active.caption && Math.abs(clickYPercent - active.caption.positionY) < 16) {
      onSelectLayer({ track: 'captions', id: active.caption.id });
      return;
    }
    if (active.broll && Math.abs(clickYPercent - active.broll.positionY) < 22) {
      onSelectLayer({ track: 'brolls', id: active.broll.id });
      return;
    }
    if (active.clip) {
      onSelectLayer({ track: 'clips', id: active.clip.id });
    }
  };

  return (
    <section
      aria-label="9:16 Video Preview Player"
      className="flex-1 min-w-0 bg-[#0B0D11] flex flex-col items-center justify-center px-6 py-4 relative overflow-hidden"
    >
      {/* Hidden synchronized HTML5 video source */}
      {project.meta.videoSourceUrl && (
        <video
          ref={videoRef}
          src={project.meta.videoSourceUrl}
          playsInline
          preload="auto"
          onLoadedMetadata={(e) => {
            const vid = e.currentTarget;
            if (Number.isFinite(vid.duration) && vid.duration > 0) {
              onDurationDetected?.(vid.duration);
            }
          }}
          className="hidden"
        />
      )}

      {/* Stage Info Bar above 9:16 frame */}
      <div className="w-[214px] sm:w-[236px] xl:w-[259px] flex items-center justify-between text-[11px] text-slate-400 mb-2">
        <span className="font-mono-tabular truncate">
          9:16 · {active.clip ? active.clip.motionPreset : 'static'}
        </span>
        <span className="font-mono-tabular text-slate-300 truncate ml-2">
          {project.meta.sourceType === 'sample'
            ? 'Sample Reel'
            : project.meta.videoFileName || 'Local Video'}
        </span>
      </div>

      {/* 9:16 Vertical Canvas Frame */}
      <div className="relative aspect-[9/16] h-[380px] sm:h-[420px] xl:h-[460px] bg-black rounded-lg border border-[#252A36] overflow-hidden shadow-lg">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          data-testid="preview-canvas"
          onClick={handleCanvasClick}
          className="w-full h-full block cursor-pointer"
        />

        {project.meta.sourceType === 'none' && !project.meta.videoSourceUrl && (
          <div className="absolute inset-0 bg-[#0E1117]/95 flex flex-col items-center justify-center p-6 text-center gap-4">
            <p className="text-sm font-medium text-slate-200">
              Upload a vertical or horizontal clip to start editing
            </p>
            <div className="flex flex-col gap-2 w-full max-w-[200px]">
              <button
                type="button"
                onClick={onUploadRequest}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Video</span>
              </button>
              <button
                type="button"
                onClick={onLoadSample}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-xs font-medium bg-[#1B202C] hover:bg-[#232938] text-slate-200 border border-[#2C3344] cursor-pointer"
              >
                <span>Load Sample Reel</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Transport & Quick Layer Controls */}
      <div className="mt-3 w-fit max-w-full flex items-center justify-between gap-3 bg-[#12151C] border border-[#252A36] rounded-lg px-3.5 py-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onTimeUpdate(0)}
            aria-label="Restart playback"
            className="p-1.5 rounded hover:bg-[#1E2330] text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onTimeUpdate(Math.max(0, currentTime - 0.5))}
            aria-label="Step back 0.5 seconds"
            className="p-1.5 rounded hover:bg-[#1E2330] text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
            className="w-8 h-8 rounded-md bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() =>
              onTimeUpdate(Math.min(project.meta.duration, currentTime + 0.5))
            }
            aria-label="Step forward 0.5 seconds"
            className="p-1.5 rounded hover:bg-[#1E2330] text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>
        </div>

        <div
          className="text-xs font-mono-tabular text-slate-200 px-2"
          data-testid="player-timecode"
        >
          <span>{formatTimecode(currentTime)}</span>
          <span className="text-slate-500 mx-1">/</span>
          <span className="text-slate-400">
            {formatTimecode(project.meta.duration)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={isMuted ? 'Unmute video audio' : 'Mute video audio'}
            className="p-1.5 rounded hover:bg-[#1E2330] text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            {isMuted ? (
              <VolumeX className="w-3.5 h-3.5" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={onQuickAddCaption}
            title="Add Caption at Playhead"
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-[#1B202C] hover:bg-[#242B3B] text-amber-300 border border-[#2C3344] cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3 h-3" />
            <span>Caption</span>
          </button>
          <button
            type="button"
            onClick={onQuickAddBRoll}
            title="Add B-Roll at Playhead"
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-[#1B202C] hover:bg-[#242B3B] text-emerald-300 border border-[#2C3344] cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3 h-3" />
            <span>B-Roll</span>
          </button>
        </div>
      </div>
    </section>
  );
};
