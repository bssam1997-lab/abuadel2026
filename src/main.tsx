import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { init as initStorage, migrateFromLocalStorage } from './utils/storage';

// One-time startup: load IndexedDB into the in-memory cache, then copy any
// pre-existing localStorage data so nothing is lost from the old storage.
initStorage()
  .then(() => migrateFromLocalStorage())
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  });
