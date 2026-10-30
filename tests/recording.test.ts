import { describe, expect, it } from 'vitest';
import {
  firstOpens,
  isYouTubeUrl,
  linkReviewMoments,
  offsetSeconds,
  resolveClipLinks,
  reviewMoments,
  videoLink,
} from '../src/lib/review/recording';

const recording = { url: 'https://youtu.be/h0hVF88AC1s', startedAt: '2026-10-29T15:56:24Z' };

describe('offsetSeconds', () => {
  it('counts whole seconds from the start, rounding down', () => {
    expect(offsetSeconds('2026-10-29T15:56:24Z', '2026-10-29T16:01:34.900Z')).toBe(310);
  });
  it('is undefined before the start or with a bad date', () => {
    expect(offsetSeconds('2026-10-29T15:56:24Z', '2026-10-29T15:56:23Z')).toBeUndefined();
    expect(offsetSeconds('2026-10-29T15:56:24Z', 'nope')).toBeUndefined();
  });
});

describe('videoLink', () => {
  it('adds t= to a youtu.be link', () => {
    expect(videoLink(recording, '2026-10-29T16:01:34.279Z')).toBe('https://youtu.be/h0hVF88AC1s?t=310');
  });
  it('keeps other parameters and replaces an existing t', () => {
    const r = { ...recording, url: 'https://www.youtube.com/watch?v=h0hVF88AC1s&t=99' };
    expect(videoLink(r, '2026-10-29T15:56:34Z')).toBe('https://www.youtube.com/watch?v=h0hVF88AC1s&t=10');
  });
  it('is undefined without a recording, without a moment or before the start', () => {
    expect(videoLink(undefined, '2026-10-29T16:01:34Z')).toBeUndefined();
    expect(videoLink(recording, undefined)).toBeUndefined();
    expect(videoLink(recording, '2026-10-29T15:00:00Z')).toBeUndefined();
  });
});

describe('linkReviewMoments', () => {
  const html = '<li>En <a href="review:2026-10-29T16:01:34.279Z">tu ola de las 08:27</a>, bien.</li>';
  it('points review links to the recording, in a new tab', () => {
    expect(linkReviewMoments(html, recording)).toBe(
      '<li>En <a href="https://youtu.be/h0hVF88AC1s?t=310" target="_blank" rel="noopener">tu ola de las 08:27</a>, bien.</li>',
    );
  });
  it('escapes & in the href', () => {
    const r = { ...recording, url: 'https://www.youtube.com/watch?v=h0hVF88AC1s' };
    expect(linkReviewMoments(html, r)).toContain('href="https://www.youtube.com/watch?v=h0hVF88AC1s&amp;t=310"');
  });
  it('leaves plain text without a recording or before the start', () => {
    expect(linkReviewMoments(html, undefined)).toBe('<li>En tu ola de las 08:27, bien.</li>');
    expect(linkReviewMoments(html, { ...recording, startedAt: '2026-10-29T17:00:00Z' })).toBe('<li>En tu ola de las 08:27, bien.</li>');
  });
  it('does not touch other links', () => {
    const other = '<a href="https://example.com">x</a>';
    expect(linkReviewMoments(other, recording)).toBe(other);
  });
});

describe('reviewMoments', () => {
  it('lists the moments of the review links in a markdown body', () => {
    expect(reviewMoments('[a](review:2026-10-29T16:01:34Z) y [b](review:2026-10-29T16:02:00.5Z) [c](https://x.y)')).toEqual([
      '2026-10-29T16:01:34Z',
      '2026-10-29T16:02:00.5Z',
    ]);
  });
});

describe('firstOpens and resolveClipLinks', () => {
  const logs = [
    {
      events: [
        { type: 'open', clip: 'C0006.MP4', at: '2026-10-29T16:01:34.279Z' },
        { type: 'play', clip: 'C0006.MP4', at: '2026-10-29T16:01:38.680Z' },
        { type: 'open', clip: 'C0006.MP4', at: '2026-10-29T16:30:00.000Z' },
      ],
    },
    { events: [{ type: 'open', clip: 'C0006.MP4', at: '2026-10-29T16:00:00.000Z' }, { type: 'open', clip: 'C0019.MP4', at: '2026-10-29T16:20:11.123Z' }] },
  ];
  it('keeps the earliest open of each clip across logs', () => {
    expect(firstOpens(logs)).toEqual(
      new Map([
        ['C0006.MP4', '2026-10-29T16:00:00.000Z'],
        ['C0019.MP4', '2026-10-29T16:20:11.123Z'],
      ]),
    );
  });
  it('turns clip links into review links, with or without the extension', () => {
    expect(resolveClipLinks('[tu ola de las 08:27](clip:C0019) y [otra](clip:C0006.MP4)', firstOpens(logs))).toBe(
      '[tu ola de las 08:27](review:2026-10-29T16:20:11.123Z) y [otra](review:2026-10-29T16:00:00.000Z)',
    );
  });
  it('fails on a clip that no log opened', () => {
    expect(() => resolveClipLinks('[x](clip:C0099)', firstOpens(logs))).toThrow('C0099');
  });
});

describe('isYouTubeUrl', () => {
  it('accepts youtu.be and youtube.com links', () => {
    expect(isYouTubeUrl('https://youtu.be/h0hVF88AC1s')).toBe(true);
    expect(isYouTubeUrl('https://www.youtube.com/watch?v=h0hVF88AC1s')).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isYouTubeUrl('https://vimeo.com/1')).toBe(false);
    expect(isYouTubeUrl('youtu.be/h0hVF88AC1s')).toBe(false);
  });
});
