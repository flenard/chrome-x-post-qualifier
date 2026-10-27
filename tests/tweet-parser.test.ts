import { describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { parseTweetElement, detectIsAd, getTweetId, getAuthorHandle } from '../src/services/tweet-parser';

// Small copies of the X markup each rule depends on. When X changes its page,
// add the new shape here before changing the parser.
const window = new Window({ url: 'https://x.com/home' });

function article(html: string): HTMLElement {
  const el = window.document.createElement('article');
  el.setAttribute('data-testid', 'tweet');
  el.innerHTML = html;
  return el as unknown as HTMLElement;
}

const header = (name: string, handle: string, id: string) => `
  <div data-testid="User-Name">
    <a href="/${handle}"><span>${name}</span></a>
    <a href="/${handle}"><span>@${handle}</span></a>
    <a href="/${handle}/status/${id}"><time>2h</time></a>
  </div>`;

describe('post id', () => {
  test('timeline post: the header timestamp', () => {
    const a = article(`${header('Me', 'me', '444')}
      <div data-testid="tweetText">hello</div>
      <a href="/other/status/111/video/1">From @other</a>`);
    expect(getTweetId(a)).toBe('444');
    expect(parseTweetElement(a)?.id).toBe('444');
  });

  // The bug: a post opened by clicking its video got the credited post's id
  // and was hidden again.
  test('post page: skips a "From @user" video credit and a quoted post', () => {
    const a = article(`
      <div data-testid="User-Name"><a href="/me"><span>Me</span></a><a href="/me"><span>@me</span></a></div>
      <div data-testid="tweetText">look at this</div>
      <a href="/other/status/111/video/1">From @other</a>
      <div role="link"><a href="/q/status/222"><time>Oct 23</time></a><div data-testid="tweetText">quoted</div></div>
      <a href="/me/status/333"><time>10:00 PM · Oct 23</time></a>`);
    expect(getTweetId(a)).toBe('333');
    expect(parseTweetElement(a)?.id).toBe('333');
  });

  test('no timestamp: falls back to the first status link', () => {
    expect(getTweetId(article(`<a href="/me/status/555">x</a>`))).toBe('555');
  });

  test('no status link at all: a stable pseudo id from the text', () => {
    const html = `<div data-testid="tweetText">same text</div>`;
    const id = parseTweetElement(article(html))?.id;
    expect(id).toStartWith('pseudo_');
    expect(parseTweetElement(article(html))?.id).toBe(id!);
  });
});

describe('ad detection', () => {
  test('a real ad label in the post', () => {
    expect(detectIsAd(article(`${header('Brand', 'brand', '1')}<span>Ad</span>`))).toBe(true);
  });

  test('aria-label Promoted', () => {
    expect(detectIsAd(article(`<div aria-label="Promoted"></div>`))).toBe(true);
  });

  // The bug: X wraps a played video in placementTracking, and the post was
  // hidden as "Promoted".
  test('a normal post with a video player', () => {
    const a = article(`${header('Mathias', 'mlech26l', '2')}
      <div data-testid="tweetText">Powered by our new d1.1</div>
      <div data-testid="placementTracking"><div data-testid="videoPlayer"><video></video></div></div>`);
    expect(detectIsAd(a)).toBe(false);
  });

  test('a pre-roll "Ad" label inside the video player', () => {
    const a = article(`<div data-testid="tweetText">clip</div>
      <div data-testid="videoPlayer"><span>Ad</span></div>`);
    expect(detectIsAd(a)).toBe(false);
  });

  test('"Ad" inside a sentence is not a label', () => {
    expect(detectIsAd(article(`<div data-testid="tweetText"><span>Ad spend is up</span></div>`))).toBe(false);
  });
});

describe('author handle', () => {
  test('from the profile link', () => {
    const a = article(header('Mathias Lechner', 'mlech26l', '1'));
    expect(getAuthorHandle(a.querySelector<HTMLElement>('[data-testid="User-Name"]')!)).toBe('mlech26l');
  });

  // A display name is free text; it must not pass as a trusted handle.
  test('ignores an @handle in the display name', () => {
    const a = article(header('Giveaway @naval', 'scammer123', '1'));
    expect(getAuthorHandle(a.querySelector<HTMLElement>('[data-testid="User-Name"]')!)).toBe('scammer123');
  });
});

describe('text', () => {
  test('splits the post text from a quoted post', () => {
    const a = article(`${header('Me', 'me', '9')}
      <div data-testid="tweetText">42% cheaper, give it a spin</div>
      <div role="link">${header('Liquid AI', 'liquidai', '8')}<div data-testid="tweetText">d1 just got an upgrade</div></div>`);
    const m = parseTweetElement(a);
    expect(m?.text).toBe('42% cheaper, give it a spin');
    expect(m?.quotedText).toBe('d1 just got an upgrade');
    expect(m?.quotedHandle).toBe('@liquidai');
  });
});
