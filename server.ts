import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_MEDIA_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
  'video/mpeg',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/aac',
]);

const ANALYSIS_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    clips: {
      type: Type.ARRAY,
      description: '2 to 5 engaging short-form viral clip segments covering the video duration.',
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          label: { type: Type.STRING, description: 'Short descriptive segment title, e.g. Hook, Main Insight, CTA' },
          startTime: { type: Type.NUMBER, description: 'Start timestamp in seconds' },
          endTime: { type: Type.NUMBER, description: 'End timestamp in seconds' },
          autoMotion: { type: Type.BOOLEAN, description: 'Whether subtle zoom/pan motion should be enabled' },
          motionPreset: {
            type: Type.STRING,
            description: 'One of: zoom-in, zoom-out, ken-burns-pan, none',
          },
          viralityNote: { type: Type.STRING, description: 'Brief rationale why this segment hooks viewers' },
        },
        required: ['label', 'startTime', 'endTime', 'autoMotion', 'motionPreset'],
      },
    },
    captions: {
      type: Type.ARRAY,
      description: 'Short, punchy word-phrase captions (3 to 7 words per caption) in Indonesian or English matching the spoken audio.',
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          text: { type: Type.STRING, description: 'Spoken phrase caption in Indonesian or English' },
          startTime: { type: Type.NUMBER, description: 'Exact start timestamp in seconds' },
          endTime: { type: Type.NUMBER, description: 'Exact end timestamp in seconds' },
        },
        required: ['text', 'startTime', 'endTime'],
      },
    },
    brolls: {
      type: Type.ARRAY,
      description: 'Suggested visual B-roll cutaways matching key spoken topics.',
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          keyword: { type: Type.STRING, description: 'Concise 2-4 word search keyword for stock B-roll' },
          prompt: { type: Type.STRING, description: 'Visual shot description for the cutaway' },
          startTime: { type: Type.NUMBER, description: 'Start timestamp in seconds' },
          endTime: { type: Type.NUMBER, description: 'End timestamp in seconds' },
          displayMode: {
            type: Type.STRING,
            description: 'One of: pip, fullscreen-cutaway, top-split',
          },
        },
        required: ['keyword', 'startTime', 'endTime', 'displayMode'],
      },
    },
  },
  required: ['clips', 'captions', 'brolls'],
};

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add your key in the Settings > Secrets panel.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildAnalysisPrompt(duration: number, fileName: string, languageHint: string): string {
  return [
    `You are an expert short-form vertical video editor (Reels, TikTok, Shorts).`,
    `Analyze the provided media ("${fileName}", duration ~${duration.toFixed(1)}s).`,
    `Primary language preference/hint: ${languageHint || 'Indonesian and English (auto-detect spoken language)'}.`,
    `Return structured JSON containing:`,
    `1. "clips": Viral clip segments partitioning the timeline (between 0 and ${duration.toFixed(1)}s) with engaging labels, autoMotion boolean, and motionPreset ("zoom-in", "zoom-out", or "ken-burns-pan").`,
    `2. "captions": Accurate, punchy 3-7 word phrase captions with precise startTime and endTime timestamps in seconds synchronized to the spoken words (preserve Indonesian or English naturally as spoken).`,
    `3. "brolls": 2 to 5 B-roll visual cutaway suggestions with concise search keywords, shot descriptions, displayMode ("pip", "top-split", or "fullscreen-cutaway"), and startTime/endTime timestamps.`,
    `Ensure every startTime < endTime and all timestamps stay within 0 and ${duration.toFixed(1)}.`,
  ].join('\n');
}

async function createApp() {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'framecut-studio' });
  });

  // Binary media analysis endpoint (up to 50MB) and JSON sample/metadata analysis endpoint
  app.post(
    '/api/analyze',
    express.raw({
      type: ['video/*', 'audio/*', 'application/octet-stream'],
      limit: '50mb',
    }),
    express.json({ limit: '2mb' }),
    async (req, res) => {
      let tempFilePath: string | null = null;
      let uploadedFileName: string | null = null;

      try {
        const ai = getGeminiClient();

        if (Buffer.isBuffer(req.body) && req.body.length > 0) {
          const rawMime = String(req.headers['x-mime-type'] || '')
            .split(';')[0]
            .trim()
            .toLowerCase();
          if (!ALLOWED_MEDIA_MIME_TYPES.has(rawMime)) {
            res.status(400).json({
              error: `Unsupported media MIME type "${rawMime || 'unknown'}". Upload MP4, WebM, MOV, MP3, or WAV.`,
            });
            return;
          }

          const durationHeader = Number(req.headers['x-duration'] || 18);
          const duration =
            Number.isFinite(durationHeader) && durationHeader > 0
              ? Math.min(durationHeader, 3600)
              : 18;
          const fileName = String(req.headers['x-file-name'] || 'uploaded-video.mp4').slice(
            0,
            120
          );
          const languageHint = String(
            req.headers['x-language-hint'] || 'Indonesian / English'
          ).slice(0, 60);

          const prompt = buildAnalysisPrompt(duration, fileName, languageHint);
          const INLINE_LIMIT_BYTES = 18 * 1024 * 1024;

          let contents: unknown;
          if (req.body.length <= INLINE_LIMIT_BYTES) {
            contents = {
              parts: [
                {
                  inlineData: {
                    mimeType: rawMime,
                    data: req.body.toString('base64'),
                  },
                },
                { text: prompt },
              ],
            };
          } else {
            const safeExt = rawMime.includes('webm')
              ? '.webm'
              : rawMime.includes('wav')
                ? '.wav'
                : rawMime.includes('mp3') || rawMime.includes('mpeg')
                  ? '.mp3'
                  : '.mp4';
            tempFilePath = path.join(
              os.tmpdir(),
              `framecut-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`
            );
            await fs.writeFile(tempFilePath, req.body);

            const uploaded = await ai.files.upload({
              file: tempFilePath,
              config: { mimeType: rawMime },
            });
            uploadedFileName = uploaded.name ?? null;

            let fileState = uploaded.state;
            let currentFile = uploaded;
            let attempts = 0;
            while (fileState === 'PROCESSING' && attempts < 30 && uploadedFileName) {
              await new Promise((r) => setTimeout(r, 1500));
              currentFile = await ai.files.get({ name: uploadedFileName });
              fileState = currentFile.state;
              attempts += 1;
            }
            if (fileState === 'FAILED') {
              throw new Error('Gemini file processing failed for the uploaded media.');
            }

            contents = [
              {
                fileData: {
                  fileUri: currentFile.uri,
                  mimeType: currentFile.mimeType ?? rawMime,
                },
              },
              { text: prompt },
            ];
          }

          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contents as Parameters<typeof ai.models.generateContent>[0]['contents'],
            config: {
              responseMimeType: 'application/json',
              responseSchema: ANALYSIS_RESPONSE_SCHEMA,
            },
          });

          const rawText = (response.text ?? '').trim();
          if (!rawText) {
            throw new Error('Gemini returned an empty analysis payload.');
          }
          const parsed = JSON.parse(rawText);
          res.json({
            model: 'gemini-2.5-flash',
            duration,
            ...parsed,
          });
          return;
        }

        // JSON mode: sample project / script-assisted analysis when no local file binary was sent
        if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
          const duration = Math.max(
            3,
            Math.min(600, Number(req.body.duration || 18))
          );
          const title = String(req.body.title || 'Sample Short Reel').slice(0, 140);
          const contextNotes = String(
            req.body.contextNotes ||
              'Short-form creator tutorial in Indonesian & English about AI-assisted vertical video editing, synced captions, and B-roll.'
          ).slice(0, 2000);
          const languageHint = String(
            req.body.languageHint || 'Indonesian & English'
          ).slice(0, 60);

          const prompt = [
            `Generate a complete, realistic short-form 9:16 edit plan for a ${duration.toFixed(1)}s video titled "${title}".`,
            `Context / spoken outline: ${contextNotes}`,
            `Language preference: ${languageHint}.`,
            `Produce punchy viral clip segments, accurate 3-7 word phrase captions spanning 0 to ${duration.toFixed(1)}s, and relevant B-roll cutaway keywords.`,
          ].join('\n');

          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: ANALYSIS_RESPONSE_SCHEMA,
            },
          });

          const rawText = (response.text ?? '').trim();
          if (!rawText) {
            throw new Error('Gemini returned an empty response.');
          }
          const parsed = JSON.parse(rawText);
          res.json({
            model: 'gemini-2.5-flash',
            duration,
            ...parsed,
          });
          return;
        }

        res.status(400).json({
          error: 'No media binary or analysis context provided in request body.',
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unexpected server error during analysis.';
        console.error('[/api/analyze] Error:', message);
        res.status(500).json({ error: message });
      } finally {
        if (tempFilePath) {
          fs.unlink(tempFilePath).catch(() => {});
        }
        if (uploadedFileName) {
          try {
            const ai = getGeminiClient();
            await ai.files.delete({ name: uploadedFileName });
          } catch {
            // Ignore cleanup failure
          }
        }
      }
    }
  );

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`FrameCut Studio server running on http://localhost:${port}`);
  });
}

createApp();
