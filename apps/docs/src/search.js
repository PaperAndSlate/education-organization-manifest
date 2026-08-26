const form = document.querySelector('[data-doc-search]');
const input = document.querySelector('#doc-search');
const results = document.querySelector('#doc-search-results');

if (form instanceof HTMLFormElement && input instanceof HTMLInputElement && results) {
  let pages = [];
  try {
    const response = await fetch('search-index.json', { credentials: 'omit', redirect: 'error' });
    if (!response.ok) throw new Error(`search index returned HTTP ${response.status}`);
    const index = await response.json();
    pages = Array.isArray(index.pages) ? index.pages : [];
  } catch {
    results.textContent = 'Search is unavailable in this offline copy.';
  }

  form.addEventListener('submit', (event) => event.preventDefault());
  input.addEventListener('input', () => {
    const query = input.value.trim().toLocaleLowerCase();
    results.replaceChildren();
    if (!query) return;
    const matches = pages
      .map((page) => ({ page, score: scorePage(page, query) }))
      .filter((item) => item.score > 0)
      .sort(
        (left, right) => right.score - left.score || left.page.url.localeCompare(right.page.url),
      )
      .slice(0, 8);
    if (matches.length === 0) {
      results.textContent = 'No matching documentation pages.';
      return;
    }
    for (const { page } of matches) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = page.url;
      link.textContent = page.title;
      const excerpt = document.createElement('span');
      excerpt.textContent = page.excerpt;
      item.append(link, excerpt);
      results.append(item);
    }
  });
}

function scorePage(page, query) {
  const title = String(page.title ?? '').toLocaleLowerCase();
  const headings = Array.isArray(page.headings) ? page.headings.join(' ').toLocaleLowerCase() : '';
  const excerpt = String(page.excerpt ?? '').toLocaleLowerCase();
  let score = 0;
  if (title.includes(query)) score += 8;
  if (headings.includes(query)) score += 4;
  if (excerpt.includes(query)) score += 1;
  return score;
}
