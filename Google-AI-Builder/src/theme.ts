export type Theme = 'dark' | 'light'

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f3f7f8' : '#111416')
  try { localStorage.setItem('samanvai-theme', theme) } catch {}
  document.dispatchEvent(new Event('samanvai-theme-change'))
}