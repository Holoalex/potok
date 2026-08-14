// Тема оформления. В оригинале их четыре плюс «системная».

const BAR_COLORS = {
  light: '#f0f0f0',
  dark: '#1d1d1d',
  black: '#0d0d0d',
  pureBlack: '#000000',
};

const media = window.matchMedia('(prefers-color-scheme: dark)');
let current = 'system';

export function applyTheme(mode = current) {
  current = mode;
  const effective = mode === 'system' ? (media.matches ? 'dark' : 'light') : mode;
  document.documentElement.dataset.theme = effective;

  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
  }
  meta.content = BAR_COLORS[effective] ?? BAR_COLORS.light;
}

media.addEventListener('change', () => {
  if (current === 'system') applyTheme('system');
});
