const express = require('express');
const authRouter = express.Router();
const bcrypt = require('bcrypt');
const { ownerModel } = require('../schema/owner')
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser'); // Add cookie-parser middleware
const {validateOwner, validateOwnerLoginDetails} = require('../utils/validate');

authRouter.use(cookieParser());

authRouter.post('/signUp', async (req, res) => {
    try {
        const user = req.body;
        validateOwner(user);
        const { firstName, lastName, email, dob, password, gender, address, bio } = user
        const passwordHash = await bcrypt.hash(password, 10);

        const owner = new ownerModel({
            firstName: firstName,
            lastName: lastName,
            dob: dob,
            password: passwordHash,
            email: email,
            gender: gender,
            bio : bio,
            address : address
        })
        const loginUser = await owner.save();
        if (!loginUser) {
            return res.status(400).send("Something went wrong");
        }
        res.status(200).end("Onwer Info Added Succesfully");
    } catch (err) {
        res.send("ERROR : " + err);
    }
});

authRouter.post('/login', async (req, res) => {
    try {
        const user = req.body;
        validateOwnerLoginDetails(user);
        const { email, password } = user;
        const loginUser = await ownerModel.findOne({ email: email });
        if (!loginUser) {
            return res.status(400).send("invalid credentials");
        }
        // Debugging logs
        console.log("Password from request:", password);
        console.log("Hashed password from database:", loginUser.password);

        const validUser = await bcrypt.compare(password, loginUser.password);
        if (!validUser) {
            return res.status(400).send("invalid credentials");
        }
        const token = await jwt.sign({_id:loginUser._id}, "Minote3#");
        res.cookie('token', token)
        res.status(200).send("Login Successfull")

    } catch (err) {
        res.send("ERROR : " + err);
    }
});

authRouter.post('/logout',(req,res)=>{
    res.clearCookie('token');
    res.status(200).send("Logout successfull")
})

module.exports = { authRouter }