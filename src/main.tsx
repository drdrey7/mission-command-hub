import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

class ErrorBoundary extends React.Component<{children: any}, {error: any}> {
  state = { error: null }
  static getDerivedStateFromError(error: any) { return { error } }
  render() {
    if (this.state.error) {
      return <div style={{color:'white',background:'#111',padding:'20px',fontSize:'14px',fontFamily:'monospace',whiteSpace:'pre-wrap'}}>{String(this.state.error)}{'\n'}{(this.state.error as any)?.stack}</div>
    }
    return this.props.children
  }
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
