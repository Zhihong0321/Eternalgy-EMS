import { useState } from 'react'
import Simulator from './pages/Simulator'
import Dashboard from './pages/Dashboard'
import Meters from './pages/Meters'
import './App.css'

type Page = 'simulator' | 'dashboard' | 'devices'

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')
  const [selectedMeterId, setSelectedMeterId] = useState<number | null>(null)

  const goToDashboard = (meterId?: number | null) => {
    if (meterId !== undefined && meterId !== null) {
      setSelectedMeterId(meterId)
    }
    setCurrentPage('dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-2xl font-bold text-gray-900">
                -                  EMS Dashboard
                +                  EMS Dashboard — Railway Deploy Test
                </h1>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => goToDashboard(selectedMeterId)}
                className={`px-4 py-2 rounded-md text-sm font-medium ${
                  currentPage === 'dashboard'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                📊 Dashboard
              </button>
              <button
                onClick={() => setCurrentPage('devices')}
                className={`px-4 py-2 rounded-md text-sm font-medium ${
                  currentPage === 'devices'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                🗂️ Devices
              </button>
              <button
                onClick={() => setCurrentPage('simulator')}
                className={`px-4 py-2 rounded-md text-sm font-medium ${
                  currentPage === 'simulator'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                📱 Simulator
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Page Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {currentPage === 'dashboard' && (
          <Dashboard selectedMeterId={selectedMeterId} onSelectMeter={setSelectedMeterId} />
        )}
        {currentPage === 'devices' && (
          <Meters selectedMeterId={selectedMeterId} onSelectMeter={goToDashboard} />
        )}
        {currentPage === 'simulator' && <Simulator />}
      </main>
    </div>
  )
}

export default App
