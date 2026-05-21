import React from 'react'
import ReactDOM from 'react-dom/client'
import { loader } from '@monaco-editor/react'
import { VoxIDEApp } from '../components/VoxIDEApp'
import { ThemeProvider } from '../ThemeContext'
import '../index.css'

// Configure Monaco CDN
loader.config({
  paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <VoxIDEApp />
    </ThemeProvider>
  </React.StrictMode>
)
