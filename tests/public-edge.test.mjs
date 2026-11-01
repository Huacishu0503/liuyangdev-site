import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';

const env = {ASSETS:{async fetch(request) {
  const path = new URL(request.url).pathname;
  if (path === '/assets/heart.svg') return new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>', {headers:{'Content-Type':'image/svg+xml'}});
  return new Response('Not found', {status:404});
}}};

test('robots.txt and favicon are served before album auth', async () => {
  const robots = await worker.fetch(new Request('https://liuyangdev.site/robots.txt'), env);
  assert.equal(robots.status, 200);
  assert.match(robots.headers.get('Content-Type'), /text\/plain/);
  assert.equal(await robots.text(), 'User-agent: *\nDisallow: /\n');
  const icon = await worker.fetch(new Request('https://liuyangdev.site/favicon.ico'), env);
  assert.equal(icon.status, 200);
  assert.match(icon.headers.get('Content-Type'), /image\/svg\+xml/);
  assert.match(await icon.text(), /<svg/);
  const head = await worker.fetch(new Request('https://liuyangdev.site/favicon.ico', {method:'HEAD'}), env);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('album assets and photos stay locked without a session', async () => {
  assert.equal((await worker.fetch(new Request('https://liuyangdev.site/album.css'), env)).status, 401);
  assert.equal((await worker.fetch(new Request('https://liuyangdev.site/uploads/' + 'ab'.repeat(32) + '.webp'), env)).status, 401);
});

test('plain HTTP redirects to HTTPS, including the Cloudflare visitor scheme', async () => {
  const redirected = await worker.fetch(new Request('http://liuyangdev.site/robots.txt'), env);
  assert.equal(redirected.status, 301);
  assert.equal(redirected.headers.get('Location'), 'https://liuyangdev.site/robots.txt');
  const post = await worker.fetch(new Request('http://liuyangdev.site/api/view/login', {method:'POST'}), env);
  assert.equal(post.status, 308);
  assert.equal(post.headers.get('Location'), 'https://liuyangdev.site/api/view/login');
  const visitor = await worker.fetch(new Request('https://liuyangdev.site/favicon.ico', {headers:{'CF-Visitor':'{"scheme":"http"}'}}), env);
  assert.equal(visitor.status, 301);
  assert.equal(visitor.headers.get('Location'), 'https://liuyangdev.site/favicon.ico');
  const local = await worker.fetch(new Request('http://127.0.0.1:4820/robots.txt'), env);
  assert.equal(local.status, 200);
  const secure = await worker.fetch(new Request('https://liuyangdev.site/robots.txt', {headers:{'CF-Visitor':'{"scheme":"https"}'}}), env);
  assert.equal(secure.status, 200);
});
