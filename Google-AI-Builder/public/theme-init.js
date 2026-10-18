(() => {
  let theme = 'dark'
  try {
    const saved = localStorage.getItem('samanvai-theme')
    if (saved === 'light' || saved === 'dark') theme = saved
  } catch {}
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f3f7f8' : '#111416')
})()