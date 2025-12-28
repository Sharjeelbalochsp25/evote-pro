import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { VoteProvider } from './context/VoteContext.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <VoteProvider>
            <App />
        </VoteProvider>
    </React.StrictMode>,
)
