// Run: npm run test:unit   (Node 22+, no extra dependencies)
import test from 'node:test';
import assert from 'node:assert/strict';
import { whatsappLink, taka } from '../src/lib/format.ts';
import { renderMarkdown } from '../src/lib/md.ts';

const TPL = 'আসসালামু আলাইকুম, Order ID: {ORDER_ID}. Product: {PRODUCT_NAME}. অনুমোদন পাইনি।';

test('whatsapp link: valid wa.me URL, local number converted to 880…', () => {
  const u = whatsappLink('01712-345678', TPL, { ORDER_ID: 'MM-2610-00001', PRODUCT_NAME: 'English Challenge Course' })!;
  assert.ok(u.startsWith('https://wa.me/8801712345678?text='));
  const text = decodeURIComponent(u.split('?text=')[1]);
  assert.ok(text.includes('Order ID: MM-2610-00001') && text.includes('Product: English Challenge Course'));
  assert.ok(!u.includes(' ') && !u.includes('{'), 'message must be URL-encoded with no placeholders left');
});
test('whatsapp link: international and empty numbers', () => {
  assert.ok(whatsappLink('+8801712345678', TPL, {})!.startsWith('https://wa.me/8801712345678?'));
  assert.equal(whatsappLink('', TPL, {}), null);
  assert.equal(whatsappLink(undefined, TPL, {}), null);
});
test('whatsapp link: special characters in product name stay inside the text parameter', () => {
  const u = whatsappLink('01712345678', 'P: {PRODUCT_NAME}', { PRODUCT_NAME: 'A&B #1 ?x=1' })!;
  assert.equal(new URL(u).searchParams.get('text'), 'P: A&B #1 ?x=1');
});
test('markdown: raw HTML and scripts are escaped', () => {
  const h = renderMarkdown('<script>alert(1)</script>\n<img src=x onerror=alert(1)>');
  assert.ok(!h.includes('<script') && !h.includes('<img'));
  assert.ok(h.includes('&lt;script&gt;'));
});
test('markdown: only http(s) and relative links; javascript: is not linked', () => {
  assert.ok(renderMarkdown('[x](javascript:alert(1))').includes('<a ') === false);
  assert.ok(renderMarkdown('[ok](https://example.com)').includes('href="https://example.com"'));
  assert.ok(renderMarkdown('[a](/faq)').includes('href="/faq"'));
});
test('markdown: attribute-breaking quotes cannot escape href', () => {
  const h = renderMarkdown('[x](https://e.com/"onmouseover="alert(1))');
  assert.ok(!/onmouseover="/.test(h));
});
test('markdown: headings and lists render', () => {
  const h = renderMarkdown('## শিরোনাম\n- এক\n- দুই\n**বোল্ড**');
  assert.ok(h.includes('<h2>') && h.includes('<ul>') && h.includes('<strong>বোল্ড</strong>'));
});
test('taka formats in Bangla digits', () => { assert.match(taka(1200), /^৳১,২০০$/); });
