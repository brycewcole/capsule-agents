import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import { Toaster } from "./components/ui/toaster"

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
      <Toaster />
    </>
  )
}

export default App