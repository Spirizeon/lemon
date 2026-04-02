import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'lemon.test',
  description: 'AI-powered test generation, execution, and self-healing fixes',
  base: '/docs/',
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Architecture', link: '/architecture/overview' },
      { text: 'Reference', link: '/reference/agents' },
      { text: 'Deployment', link: '/deployment/github-actions' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Quick Start', link: '/guide/quick-start' },
          { text: 'How It Works', link: '/guide/how-it-works' },
        ],
      },
      {
        text: 'Architecture',
        items: [
          { text: 'Overview', link: '/architecture/overview' },
          { text: 'Agents', link: '/architecture/agents' },
          { text: 'Tools', link: '/architecture/tools' },
          { text: 'Control Flow', link: '/architecture/control-flow' },
          { text: 'State Management', link: '/architecture/state-management' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Agents API', link: '/reference/agents' },
          { text: 'Tools API', link: '/reference/tools' },
          { text: 'Entry Points', link: '/reference/entry-points' },
          { text: 'Configuration', link: '/reference/configuration' },
        ],
      },
      {
        text: 'Deployment',
        items: [
          { text: 'GitHub Actions', link: '/deployment/github-actions' },
          { text: 'Docker Setup', link: '/deployment/docker' },
        ],
      },
      {
        text: 'About',
        items: [
          { text: 'Vision', link: '/guide/vision' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/berzi/lemon' },
    ],
    footer: {
      message: 'Open Source',
    },
  },
})
