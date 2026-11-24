import type { ProjectTracks } from '../types/project';
import { normalizeTracksFromAI } from '../utils/projectOps';

export interface GeminiAnalyzeOptions {
  file?: File | Blob | null;
  fileName: string;
  mimeType: string;
  duration: number;
  title?: string;
  contextNotes?: string;
  languageHint?: string;
}

export interface GeminiAnalyzeResult {
  model: string;
  duration: number;
  tracks: ProjectTracks;
}

export async function probeMediaDuration(file: Blob): Promise<number | null> {
  if (typeof document === 'undefined') return null;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const media = document.createElement(
      file.type.startsWith('audio/') ? 'audio' : 'video'
    );
    media.preload = 'metadata';

    const cleanup = (val: number | null) => {
      URL.revokeObjectURL(url);
      resolve(val);
    };

    media.onloadedmetadata = () => {
      const dur = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : null;
      cleanup(dur);
    };
    media.onerror = () => cleanup(null);
    media.src = url;
  });
}

export async function analyzeMediaWithGemini(
  options: GeminiAnalyzeOptions
): Promise<GeminiAnalyzeResult> {
  const { file, fileName, mimeType, duration, title, contextNotes, languageHint } = options;

  let response: Response;

  if (file) {
    const maxBytes = 48 * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new Error(
        `File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 48 MB direct upload limit. Please trim or compress the clip first.`
      );
    }

    response = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': mimeType || 'video/mp4',
        'x-mime-type': mimeType || 'video/mp4',
        'x-file-name': encodeURIComponent(fileName).slice(0, 120),
        'x-duration': String(Math.max(1, duration)),
        'x-language-hint': languageHint || 'Indonesian / English',
      },
      body: file,
    });
  } else {
    response = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: title || fileName,
        duration,
        contextNotes,
        languageHint: languageHint || 'Indonesian & English',
      }),
    });
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Analysis request failed (${response.status}).`);
  }

  const resolvedDuration = Math.max(1, Number(data.duration || duration));
  const tracks = normalizeTracksFromAI(
    {
      clips: data.clips,
      captions: data.captions,
      brolls: data.brolls,
    },
    resolvedDuration
  );

  return {
    model: data.model || 'gemini-2.5-flash',
    duration: resolvedDuration,
    tracks,
  };
}
