import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { supportsViewTransitions } from './motion.ts';

if (!supportsViewTransitions()) document.documentElement.classList.add('no-vt');

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
