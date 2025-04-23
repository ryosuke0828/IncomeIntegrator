import React from 'react'
import { Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import NotFound from './pages/NotFound.tsx';
import Home from './pages/Home.tsx';
import Config from './pages/Config.tsx';

function App()  {
  return (
    <Router>
        <Routes>
          <Route index element={<Home/>} />
          <Route path='*' element={<NotFound />} />
          <Route path='/Config' element={<Config />}/>
        </Routes>
      </Router>
  )
}

export default App;