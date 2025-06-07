const express = require('express');
const profileRouter = express.Router();
const jwt = require('jsonwebtoken');
const { ownerModel } = require('../schema/owner');
const { authenticate } = require('../middlewares/authenticate');
const bcrypt = require('bcrypt');
const validator = require('validator');

profileRouter.use(authenticate);

profileRouter.get('/profile/view', async (req, res) => {
    try {
        const { token } = req.cookies;
        if (!token) {
            res.status(401).end("login to access")
        }
        const decodeobje = await jwt.verify(token, "Minote3#")
        const { _id } = decodeobje
        const user = await ownerModel.findOne({ _id: _id })
        res.owner = user
        req.owner = user
        res.json({
            "message": "Welcome " + user.firstName,
            OwnerInfo: user
        });
    } catch (err) {
        console.log(err)
    }
});

profileRouter.patch('/profile/edit', async (req, res) => {
    try {
        const editableFields = ['gender', 'age', 'address', 'email', 'bio'];
        const owner = req.owner
        Object.keys(req.body).forEach((key) => {
            if (editableFields.includes(key)) {
                owner[key] = req.body[key]
            }
            else {
                throw new Error("Update request is not valid");
            }
        })
        await owner.save();
        res.json({ 'message': `${owner.firstName}, Your Profile Updated succesfully` });
    } catch (err) {
        res.status(400).end("Error : ", err);
    }
})

profileRouter.patch('/profile/passwordUpdate', async (req, res) => {
    try {
        const { oldPassword, newPassword, confirmPassword } = req.body;
        const isOldPassValid = await bcrypt.compare(oldPassword, req.owner.password)
        if (!isOldPassValid) {
            res.status(400).send("Password incorrect")
        }
        if (!validator.isStrongPassword(newPassword)) {
            res.status(400).send("Password is Weak");
        }
        if (newPassword != confirmPassword) {
            res.status(400).send("Passwords doesnot match");
        }
        const newPasswordHash = await bcrypt.hash(newPassword, 10);
        await ownerModel.findByIdAndUpdate(req.owner._id, { password: newPasswordHash });
        res.status(200).send("Password updated successfully");
    } catch (err) {
        res.status(400).send(err.message);
    }
})

module.exports = { profileRouter };