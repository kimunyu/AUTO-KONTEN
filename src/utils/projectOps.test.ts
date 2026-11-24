import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addTrackItem,
  clampTimeRange,
  computeActiveWordIndex,
  computeAutoMotionTransform,
  deleteTrackItem,
  formatTimecode,
  getActiveItemsAtTime,
  normalizeTracksFromAI,
  shiftTrackItem,
  splitClipAtTime,
  updateCaptionItem,
} from './projectOps';
import type { ProjectState } from '../types/project';

function createFixtureProject(): ProjectState {
  return {
    meta: {
      title: 'Test Short',
      aspectRatio: '9:16',
      duration: 15,
      videoSourceUrl: null,
      sourceType: 'sample',
    },
    tracks: {
      clips: [
        {
          id: 'clip-1',
          label: 'Hook',
          startTime: 0,
          endTime: 8,
          sourceOffset: 0,
          autoMotion: true,
          motionPreset: 'zoom-in',
          motionIntensity: 1.2,
        },
      ],
      captions: [
        {
          id: 'cap-1',
          text: 'One two three four',
          startTime: 1,
          endTime: 5,
          fontSize: 56,
          color: '#FFFFFF',
          highlightColor: '#FACC15',
          backgroundColor: 'rgba(11,13,17,0.72)',
          positionX: 50,
          positionY: 75,
          activeWordHighlight: true,
        },
      ],
      brolls: [
        {
          id: 'broll-1',
          keyword: 'coffee pour',
          startTime: 2,
          endTime: 4,
          opacity: 0.9,
          scale: 1,
          positionX: 50,
          positionY: 30,
          displayMode: 'pip',
        },
      ],
    },
  };
}

test('formatTimecode formats minutes, seconds, and tenths consistently', () => {
  assert.equal(formatTimecode(0), '00:00.0');
  assert.equal(formatTimecode(12.46), '00:12.4');
  assert.equal(formatTimecode(75.2), '01:15.2');
});

test('clampTimeRange respects bounds and minimum item length', () => {
  const clamped = clampTimeRange(-2, 0.1, 10, 0.25);
  assert.equal(clamped.startTime, 0);
  assert.equal(clamped.endTime, 0.25);
});

test('getActiveItemsAtTime returns synchronized clip, caption, and broll', () => {
  const project = createFixtureProject();
  const active = getActiveItemsAtTime(project.tracks, 2.5);
  assert.equal(active.clip?.id, 'clip-1');
  assert.equal(active.caption?.id, 'cap-1');
  assert.equal(active.broll?.id, 'broll-1');

  const outside = getActiveItemsAtTime(project.tracks, 10);
  assert.equal(outside.clip, null);
  assert.equal(outside.caption, null);
  assert.equal(outside.broll, null);
});

test('computeAutoMotionTransform interpolates zoom-in smoothly', () => {
  const project = createFixtureProject();
  const clip = project.tracks.clips[0];
  const atStart = computeAutoMotionTransform(clip, 0);
  const atMid = computeAutoMotionTransform(clip, 4);
  const atEnd = computeAutoMotionTransform(clip, 8);
  assert.equal(atStart.scale, 1);
  assert.equal(atMid.scale, 1.1);
  assert.equal(atEnd.scale, 1.2);
});

test('computeActiveWordIndex highlights words proportionally over caption span', () => {
  const project = createFixtureProject();
  const cap = project.tracks.captions[0];
  assert.equal(computeActiveWordIndex(cap, 1.1), 0);
  assert.equal(computeActiveWordIndex(cap, 2.5), 1);
  assert.equal(computeActiveWordIndex(cap, 4.9), 3);
});

test('updateCaptionItem clamps position and fontSize safely', () => {
  const project = createFixtureProject();
  const next = updateCaptionItem(project, 'cap-1', {
    text: 'Updated hook',
    fontSize: 999,
    positionY: 99,
  });
  assert.equal(next.tracks.captions[0].text, 'Updated hook');
  assert.equal(next.tracks.captions[0].fontSize, 110);
  assert.equal(next.tracks.captions[0].positionY, 92);
});

test('shiftTrackItem moves item within project duration', () => {
  const project = createFixtureProject();
  const shifted = shiftTrackItem(project, 'brolls', 'broll-1', 20);
  assert.equal(shifted.tracks.brolls[0].startTime, 13);
  assert.equal(shifted.tracks.brolls[0].endTime, 15);
});

test('splitClipAtTime splits clip and updates sourceOffset cleanly', () => {
  const project = createFixtureProject();
  const split = splitClipAtTime(project, 'clip-1', 3.5);
  assert.equal(split.tracks.clips.length, 2);
  assert.equal(split.tracks.clips[0].endTime, 3.5);
  assert.equal(split.tracks.clips[1].startTime, 3.5);
  assert.equal(split.tracks.clips[1].sourceOffset, 3.5);
});

test('addTrackItem and deleteTrackItem maintain clean track arrays', () => {
  const project = createFixtureProject();
  const { nextState, createdId } = addTrackItem(project, 'captions', 6);
  assert.equal(nextState.tracks.captions.length, 2);
  const afterDelete = deleteTrackItem(nextState, 'captions', createdId);
  assert.equal(afterDelete.tracks.captions.length, 1);
});

test('normalizeTracksFromAI clamps and fills defaults for AI output', () => {
  const tracks = normalizeTracksFromAI(
    {
      clips: [{ label: 'Intro Hook', startTime: 0, endTime: 10 }],
      captions: [{ text: 'Halo guys, ini rahasianya!', startTime: 0.5, endTime: 3.5 }],
      brolls: [{ keyword: 'neon studio camera', startTime: 1, endTime: 4 }],
    },
    12
  );
  assert.equal(tracks.clips[0].autoMotion, true);
  assert.equal(tracks.captions[0].text, 'Halo guys, ini rahasianya!');
  assert.equal(tracks.brolls[0].displayMode, 'pip');
});
