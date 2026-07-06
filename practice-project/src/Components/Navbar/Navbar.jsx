import {react } from 'react';
import { Link } from 'react-router-dom';
import {useState , useEffect , useMemo} from 'react'; 
import './Navbar.css'

function Navbar()
{

return(
    <div className = 'navbar'> 
        <ul className = 'nav-list'>
           <Link to = '/' className = 'nav-link'>Home</Link>
           <Link to = '/display' className = 'nav-link'>Display</Link>

        </ul>
    </div>

);


}
 

export default Navbar;