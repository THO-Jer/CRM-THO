import React from 'react'
import ReactDOM from 'react-dom/client'
import CRMApp from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <ErrorBoundary>
    <CRMApp />
  </ErrorBoundary>,
)
