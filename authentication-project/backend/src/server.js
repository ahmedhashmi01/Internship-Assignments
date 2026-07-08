import express, { response } from 'express';
import fs, { read } from "fs";
import path from "path";


const app = express();
const port = 3000;


app.use(express.json());
const usersFilePath = path.join(process.cwd(), "data", "users.json");

const readUsers = () => {
  const data = fs.readFileSync(usersFilePath, "utf-8");
  return JSON.parse(data);
};
const writeUsers = (users) => {
  fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
};



app.get("/", (request, response)=>{
    response.send("authentication API is running");
})

app.get("/api/users", (request , response)=>{
    const users = readUsers();
    response.status(200).json({
        users,
    })
})

app.post("/api/signup", (request, response) =>{
    const {name , email , password} = request.body;
    if(!name || !email || !password)
    {
        return response.status(400).json({
            message : "All fields required"
        })
    }
    const users = readUsers();
    const n_user = {
        id: users.length+1,
        name, email, password
    }
    users.push(n_user);
    writeUsers(users);
    response.status(201).json({
        message : "signup req recieved",
        user: {
            id : n_user.id,
            name:n_user.name,
            email:n_user.email,

        },
    })
})

app.delete("/api/delete" , (request, response)=>{
    const users = readUsers();
    const {id} = request.body;
    const u = users.filter(user => user.id !== id);
    writeUsers(u);
    response.status(200).json(({
        message: "deleted",
        u, 
    }))
})

app.put("/api/update", (req, res)=>{
    const {id, name , email , password} = req.body;
    const users = readUsers();
    users.forEach((user)=>{
        if(user.id == id)
        {
            user.name = name;
            user.email = email;
            user.password = password;
        }
    })
    writeUsers(users);
    res.status(200).json({
    message: "User updated",
    users,
  });
})

app.patch("/api/update", (req, res)=>{
    const {id, name , email , password} = req.body;
    const users = readUsers();
    const user = find((user)=> user.id== id)
    if(!user)
    {
        return res.status(404);
    }
    users.forEach((user)=>{
        if(user.id == id)
        {
            if(name){
                user.name = name;
            }
            if(email)
            {
               user.email = email;
            }
            if(password)
            {
               user.password = password;
            }
            
        }
    })
    writeUsers(users);
    res.status(200).json({
    message: "User updated",
    users,
  });
})

app.post("/api/signin", (req, res)=>{
    const {id ,email , password} = req.body;
    const users = readUsers();
    const user = users.find((user)=>{
        return user.id==id;
    })
    if(!user || !email || !password)
    {
        return res.status(404);
    }
    if(user.password== password && user.email == email)
    {
        return res.status(200).json({
            message:"Allow login"
        })
    }
    else{
        return res.status(401).json({
            message: "Invalid email , password"
        })
    }
})
app.listen(port , ()=>{
    console.log(`server started at port ${port}`);
})

