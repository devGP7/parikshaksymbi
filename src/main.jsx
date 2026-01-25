import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { FirebaseProvider } from './context/Firebase.jsx'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
    <FirebaseProvider>
    <App />
    </FirebaseProvider>
    </BrowserRouter>
  </StrictMode>,
)
