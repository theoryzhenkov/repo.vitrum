import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Vitrum',
    description: 'Annotate anything on the web, save it to your lists, and bring your agents with you.',
    permissions: ['storage'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Vitrum',
    },
    commands: {
      'element-picker': {
        suggested_key: { default: 'Alt+E' },
        description: 'Annotate an element on the page',
      },
      'save-selection': {
        suggested_key: { default: 'Alt+S' },
        description: 'Save the current selection',
      },
    },
  },
});
