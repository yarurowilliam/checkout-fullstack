import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import App from './App';
import './index.css';
import { createStore } from './store';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={createStore()}>
      <App />
    </Provider>
  </StrictMode>,
);
