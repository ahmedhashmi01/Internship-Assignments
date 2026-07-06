import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import './App.css'
import Navbar from './Components/Navbar/Navbar.jsx'
import Home from './Components/Home/Home.jsx'
import { Route, Routes } from 'react-router-dom'
import Display from './Components/Display/Display.jsx'
function App() {
  return (
    <>
    <Navbar></Navbar>
    <Routes>
      <Route path='/' element={<Home></Home>}></Route>
      <Route path = '/display' element = {<Display></Display>}></Route>
    </Routes>
    </>
  );
}

export default App;
