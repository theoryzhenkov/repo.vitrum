import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ensureDocumentStyles } from './highlightPainter';
import './style.css';

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    ensureDocumentStyles();

    const ui = await createShadowRootUi(ctx, {
      name: 'vitrum-ui',
      position: 'overlay',
      zIndex: 2147483000,
      anchor: 'body',
      onMount: (container) => {
        const root = ReactDOM.createRoot(container);
        root.render(<App />);
        return root;
      },
      onRemove: (root) => {
        root?.unmount();
      },
    });

    ui.mount();
  },
});
