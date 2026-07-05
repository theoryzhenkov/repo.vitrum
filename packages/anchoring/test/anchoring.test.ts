import { beforeEach, describe, expect, it } from 'vitest';
import {
  anchorTarget,
  describeElement,
  describeTextRange,
  normalizeUrl,
  rangeFromString,
} from '../src/index';

function setBody(html: string): Element {
  document.body.innerHTML = html;
  return document.body;
}

function anchoredText(root: Element, target: NonNullable<ReturnType<typeof describeTextRange>>): string | null {
  const anchored = anchorTarget(root, target);
  if (!anchored || anchored.kind !== 'text') return null;
  return anchored.range.toString();
}

describe('text anchoring', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('roundtrips a simple range', () => {
    const root = setBody('<p id="a">The quick brown fox jumps over the lazy dog.</p>');
    const range = rangeFromString(root, 'quick brown fox')!;
    const target = describeTextRange(root, range)!;
    expect(target).not.toBeNull();
    expect(anchoredText(root, target)).toBe('quick brown fox');
  });

  it('roundtrips a range spanning inline elements', () => {
    const root = setBody('<p>alpha <b>beta</b> gamma <i>delta</i> epsilon</p>');
    const range = rangeFromString(root, 'beta gamma delta')!;
    const target = describeTextRange(root, range)!;
    expect(anchoredText(root, target)).toBe('beta gamma delta');
  });

  it('survives content inserted before the target (position drift)', () => {
    const root = setBody('<p id="target">A rare phrase like syzygy quantifier lives here.</p>');
    const range = rangeFromString(root, 'syzygy quantifier')!;
    const target = describeTextRange(root, range)!;

    // Shift everything: prepend three paragraphs.
    document.body.insertAdjacentHTML(
      'afterbegin',
      '<p>Padding one.</p><p>Padding two.</p><p>Padding three.</p>',
    );
    expect(anchoredText(root, target)).toBe('syzygy quantifier');
  });

  it('disambiguates repeated quotes using context', () => {
    const root = setBody(
      '<p id="first">Before red. the same phrase appears. after blue.</p>' +
        '<p id="second">Before green. the same phrase appears. after yellow.</p>',
    );
    // Target the second occurrence.
    const second = document.getElementById('second')!;
    const range = rangeFromString(second, 'the same phrase appears')!;
    const target = describeTextRange(root, range)!;

    // Invalidate the position selector by prepending content.
    document.body.insertAdjacentHTML('afterbegin', '<p>Some drift so positions are stale.</p>');

    const anchored = anchorTarget(root, target)!;
    expect(anchored.kind).toBe('text');
    if (anchored.kind === 'text') {
      const container = anchored.range.startContainer.parentElement!;
      expect(container.id).toBe('second');
    }
  });

  it('fuzzy-matches when the text was edited slightly', () => {
    const root = setBody(
      '<p id="t">The committee ultimately concluded that the proposal was fundamentally sound and worth pursuing further.</p>',
    );
    const range = rangeFromString(
      root,
      'committee ultimately concluded that the proposal was fundamentally sound',
    )!;
    const target = describeTextRange(root, range)!;

    // Edit a word inside the quote.
    const p = document.getElementById('t')!;
    p.textContent = p.textContent!.replace('fundamentally sound', 'fundamentally reasonable');

    const anchored = anchorTarget(root, target);
    expect(anchored).not.toBeNull();
    if (anchored && anchored.kind === 'text') {
      const found = anchored.range.toString();
      expect(found).toContain('committee ultimately concluded');
      expect(found).toContain('reasonable');
    }
  });

  it('returns null (orphan) when the text is gone entirely', () => {
    const root = setBody('<p>A wholly unique passage about xylophones and quasars.</p>');
    const range = rangeFromString(root, 'xylophones and quasars')!;
    const target = describeTextRange(root, range)!;

    document.body.innerHTML = '<p>Completely different content now, nothing shared at all.</p>';
    expect(anchorTarget(root, target)).toBeNull();
  });

  it('ignores script/style and Vitrum UI text', () => {
    const root = setBody(
      '<p>visible text</p><script>const hidden = "should not appear";</script>' +
        '<div data-vitrum-ui="1">overlay junk</div>',
    );
    const range = rangeFromString(root, 'visible text')!;
    const target = describeTextRange(root, range)!;
    expect(anchoredText(root, target)).toBe('visible text');
    expect(rangeFromString(root, 'should not appear')).toBeNull();
    expect(rangeFromString(root, 'overlay junk')).toBeNull();
  });
});

describe('element anchoring', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('roundtrips via CSS path', () => {
    const root = setBody('<div><img src="/chart.png" alt="GDP chart"><p>caption</p></div>');
    const img = document.querySelector('img')!;
    const target = describeElement(root, img);
    const anchored = anchorTarget(root, target)!;
    expect(anchored.kind).toBe('element');
    if (anchored.kind === 'element') expect(anchored.element).toBe(img);
  });

  it('falls back to fingerprint when structure changes', () => {
    const root = setBody('<div><img src="/chart.png" alt="GDP chart"></div>');
    const target = describeElement(root, document.querySelector('img')!);

    // Restructure: the CSS path no longer resolves to the image.
    document.body.innerHTML =
      '<section><header>New header</header><figure><img src="/chart.png" alt="GDP chart"></figure></section>';
    const anchored = anchorTarget(root, target)!;
    expect(anchored).not.toBeNull();
    expect(anchored.kind).toBe('element');
    if (anchored.kind === 'element') {
      expect(anchored.element.getAttribute('src')).toBe('/chart.png');
    }
  });

  it('orphans when nothing plausible remains', () => {
    const root = setBody('<div><img src="/chart.png" alt="GDP chart"></div>');
    const target = describeElement(root, document.querySelector('img')!);
    document.body.innerHTML = '<div><img src="/other.jpg" alt="unrelated"><img src="/x.gif"></div>';
    expect(anchorTarget(root, target)).toBeNull();
  });
});

describe('normalizeUrl', () => {
  it('strips tracking params, fragments, and trailing slashes', () => {
    expect(
      normalizeUrl('https://Example.com/Post/?utm_source=tw&b=2&a=1&fbclid=xyz#section-3'),
    ).toBe('https://example.com/Post?a=1&b=2');
  });

  it('keeps meaningful query params and sorts them', () => {
    expect(normalizeUrl('https://example.com/search?q=foo&page=2')).toBe(
      'https://example.com/search?page=2&q=foo',
    );
  });

  it('leaves invalid URLs untouched', () => {
    expect(normalizeUrl('not a url')).toBe('not a url');
  });

  it('preserves the root path', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
  });
});
