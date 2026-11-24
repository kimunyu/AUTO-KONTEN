import type { ProjectState, ProjectTracks } from '../types/project';
import { normalizeTracksFromAI } from '../utils/projectOps';
import { analyzeMediaWithGemini } from './geminiAnalyzer';

export interface ExternalModuleCapabilities {
  analyzeMedia: boolean;
  resolveBRollMedia: boolean;
  exportProject: boolean;
}

export interface ExternalAnalysisInput {
  file?: File | Blob | null;
  fileName: string;
  mimeType: string;
  duration: number;
  title?: string;
  languageHint?: string;
  contextNotes?: string;
}

export interface ExternalBRollAsset {
  mediaUrl: string;
  attribution?: string;
}

export interface ExternalModuleProvider {
  id: string;
  name: string;
  description: string;
  endpointUrl?: string;
  capabilities: ExternalModuleCapabilities;
  analyzeMedia?: (input: ExternalAnalysisInput) => Promise<ProjectTracks>;
  resolveBRollMedia?: (keyword: string) => Promise<ExternalBRollAsset | null>;
  exportProject?: (project: ProjectState) => Promise<Blob>;
}

export function isValidHttpUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const geminiBuiltInProvider: ExternalModuleProvider = {
  id: 'gemini-builtin',
  name: 'Gemini 2.5 Flash (Built-In)',
  description:
    'Server-proxied multimodal video & audio analysis extracting viral clips, ID/EN captions, and B-roll cues.',
  capabilities: {
    analyzeMedia: true,
    resolveBRollMedia: false,
    exportProject: false,
  },
  async analyzeMedia(input) {
    const result = await analyzeMediaWithGemini({
      file: input.file,
      fileName: input.fileName,
      mimeType: input.mimeType,
      duration: input.duration,
      title: input.title,
      contextNotes: input.contextNotes,
      languageHint: input.languageHint,
    });
    return result.tracks;
  },
};

export function createCustomEndpointProvider(config: {
  id?: string;
  name: string;
  endpointUrl: string;
}): ExternalModuleProvider {
  const cleanUrl = config.endpointUrl.trim().replace(/\/+$/, '');
  if (!isValidHttpUrl(cleanUrl)) {
    throw new Error('Endpoint URL must start with http:// or https://');
  }

  return {
    id: config.id || `custom-${Date.now().toString(36)}`,
    name: config.name.trim() || 'External Adapter Endpoint',
    description: `Connects to external local/GitHub service at ${cleanUrl} returning ProjectState tracks.`,
    endpointUrl: cleanUrl,
    capabilities: {
      analyzeMedia: true,
      resolveBRollMedia: true,
      exportProject: true,
    },
    async analyzeMedia(input) {
      const form = new FormData();
      if (input.file) {
        form.append('media', input.file, input.fileName);
      }
      form.append('duration', String(input.duration));
      form.append('languageHint', input.languageHint || 'Indonesian / English');

      const res = await fetch(`${cleanUrl}/analyze`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        throw new Error(`External adapter /analyze failed (${res.status}).`);
      }
      const json = await res.json();
      return normalizeTracksFromAI(json, input.duration);
    },
    async resolveBRollMedia(keyword) {
      const res = await fetch(
        `${cleanUrl}/broll?q=${encodeURIComponent(keyword)}`
      );
      if (!res.ok) return null;
      const json = await res.json();
      if (typeof json.mediaUrl === 'string' && isValidHttpUrl(json.mediaUrl)) {
        return {
          mediaUrl: json.mediaUrl,
          attribution: typeof json.attribution === 'string' ? json.attribution : undefined,
        };
      }
      return null;
    },
    async exportProject(project) {
      const res = await fetch(`${cleanUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      });
      if (!res.ok) {
        throw new Error(`External adapter /render failed (${res.status}).`);
      }
      return res.blob();
    },
  };
}

class ExternalAdapterRegistry {
  private providers: ExternalModuleProvider[] = [geminiBuiltInProvider];
  private activeId: string = geminiBuiltInProvider.id;

  getProviders(): ExternalModuleProvider[] {
    return [...this.providers];
  }

  getActiveProvider(): ExternalModuleProvider {
    return (
      this.providers.find((p) => p.id === this.activeId) ?? geminiBuiltInProvider
    );
  }

  setActiveProvider(id: string): ExternalModuleProvider {
    const found = this.providers.find((p) => p.id === id);
    if (!found) {
      throw new Error(`Unknown provider "${id}".`);
    }
    this.activeId = found.id;
    return found;
  }

  registerProvider(provider: ExternalModuleProvider, activate = true): void {
    const existingIdx = this.providers.findIndex((p) => p.id === provider.id);
    if (existingIdx >= 0) {
      this.providers[existingIdx] = provider;
    } else {
      this.providers.push(provider);
    }
    if (activate) {
      this.activeId = provider.id;
    }
  }
}

export const moduleRegistry = new ExternalAdapterRegistry();
