import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd());
const docsSource = join(root, 'apps', 'docs', 'src');
const playgroundSource = join(root, 'apps', 'playground', 'src');
const pages = [
  'index.html',
  'publish.html',
  'consume.html',
  'reference.html',
  'integrate.html',
  'explore.html',
  'govern.html',
  'faq.html',
];

describe('static EOM documentation and browser tools', () => {
  it('provides accessible, draft-aware documentation pages with local security policy', () => {
    for (const page of pages) {
      const html = readFileSync(join(docsSource, page), 'utf8');
      expect(html, page).toMatch(/<html\b[^>]*\blang="[A-Za-z-]+"/u);
      expect(html, page).toMatch(/<main\b[^>]*\bid="main"/u);
      expect(html, page).toMatch(/<h1\b/u);
      expect(html, page).toMatch(/Content-Security-Policy/u);
      expect(html, page).not.toMatch(/<script\b[^>]+src=["']https?:/iu);
    }
    for (const page of ['index.html', 'govern.html', 'faq.html']) {
      expect(readFileSync(join(docsSource, page), 'utf8'), page).toMatch(/working[- ]draft/iu);
    }
  });

  it('keeps playground validation local and prevents accidental raw HTML injection', () => {
    const html = readFileSync(join(playgroundSource, 'index.html'), 'utf8');
    const app = readFileSync(join(playgroundSource, 'app.js'), 'utf8');
    const engine = readFileSync(join(playgroundSource, 'browser-engine.js'), 'utf8');
    expect(html).toMatch(/connect-src\s+'self'/iu);
    expect(html).toMatch(/type="file"/u);
    expect(html).toMatch(/does not\s+retain your input/iu);
    expect(app).toMatch(/async function validateWithSameOriginService/iu);
    expect(app).toMatch(/service\.origin\s*!==\s*window\.location\.origin/u);
    expect(app).toMatch(/credentials:\s*['"]omit['"]/u);
    expect(app).toMatch(/redirect:\s*['"]error['"]/u);
    expect(app).not.toMatch(/XMLHttpRequest|sendBeacon|innerHTML/iu);
    expect(app).toContain('parseBrowserSource');
    expect(engine).toContain('semanticFindings');
    expect(app).toContain('URL.createObjectURL');
  });
});
