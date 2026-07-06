// formatting Linting
// when u press cntrl s it should format and resolve linting issues 
// and warnings as well 
// implement pre commit , what is husky? it is used for precommit 
// after this push it to github 
// vs code 
import {react, useState, useEffect} from 'react'
import './Home.css'

function Home()
{
   

    const [student , setStudent] = useState(
        {
            name: "",
            age : 0,
            email: "",
            degree:"",
            gender:"",
            id : Date.now()
        }
    )

    function handleSubmit(e)
    {
        console.log(student);
        e.preventDefault();
    }
    return(
        <div className = 'home'>
            <form className='input-form'>
                <input type = "text" placeholder = "Enter Your Name " value = {student.name} onChange={(e) => setStudent(
                    {
                        ...student, name: e.target.value
                    }
                )}/>
                <input type = "number" placholder = "Enter Your Age" value = {student.age} onChange={(e) => setStudent(
                    {
                        ...student, age: e.target.value
                    }
                )}/>
                <input type = "email" placeholder = "Enter Your Email" value = {student.email}
                onChange={(e) => setStudent(
                    {
                        ...student, email: e.target.value
                    }
                )}/>
                <input type = "text" placeholder = "Enter Degree program" value = {student.degree}onChange={(e) => setStudent(
                    {
                        ...student, degree: e.target.value
                    }
                )}/>
                <div className = 'radio-btn'>
                <input type = "radio" name = "gender" value = {student.gender}
                onChange={(e) => setStudent(
                    {
                        ...student, gender: e.target.value
                    }
                )}/>
                <label>Male</label>
                <input type = "radio" name = "gender" value = {student.gender} 
                onChange={(e) => setStudent(
                    {
                        ...student, gender: e.target.value
                    }
                )}/>
                <label>Female</label>
                </div>
                <button type = "submit" className='submit-btn' onClick={handleSubmit}>Submit</button>
            </form>
            <div>
                <p>{student.name}</p>
            </div>
        </div>
    );
}


export default Home;
