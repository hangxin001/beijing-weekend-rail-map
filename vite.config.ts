import { defineConfig } from 'vite'

function pagesBase(): string {
  if (process.env.PAGES_BASE_PATH) return process.env.PAGES_BASE_PATH

  const repository = process.env.GITHUB_REPOSITORY?.split('/')[1]
  if (!repository || repository.endsWith('.github.io')) return '/'
  return `/${repository}/`
}

export default defineConfig({
  base: pagesBase(),
})
