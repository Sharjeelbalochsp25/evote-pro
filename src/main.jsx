import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)

// Build marker
// This log helps confirm which build is deployed.
/* eslint-disable no-console */
console.log('E-VotePro build: 0.0.1')
