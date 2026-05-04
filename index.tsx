import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Apply language/dir before first render to prevent RTL flash
const savedLang = localStorage.getItem('language');
if (savedLang) {
  document.documentElement.lang = savedLang;
  document.documentElement.dir = savedLang === 'he-IL' ? 'rtl' : 'ltr';
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);