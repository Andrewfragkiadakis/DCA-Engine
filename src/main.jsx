import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import PortfolioRoadmap from './PortfolioRoadmap.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PortfolioRoadmap />
    <Analytics />
  </StrictMode>
)
