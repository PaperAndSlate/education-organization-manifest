/** @type {import('prettier').Config} */
export default {
  printWidth: 100,
  singleQuote: true,
  trailingComma: 'all',
  semi: true,
  endOfLine: 'lf',
  proseWrap: 'preserve',
  overrides: [
    { files: ['*.json', '*.jsonc'], options: { singleQuote: false } },
    { files: ['*.md', '*.txt'], options: { proseWrap: 'preserve' } },
  ],
};
