import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

/* eslint-disable no-console */
window.addEventListener('unhandledrejection', (event) => {
    console.error('[Global] Unhandled promise rejection', event.reason);
});

window.addEventListener('error', (event) => {
    console.error('[Global] Unhandled runtime error', event.error || event.message);
});

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)

// Build marker
// This log helps confirm which build is deployed.
console.log('E-VotePro build: 0.0.3')
