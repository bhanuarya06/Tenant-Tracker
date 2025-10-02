const express = require('express');
const ownerProfileRouter = express.Router();
const { ownerModel } = require('../../schema/owner');
const { ownerAuth } = require('../../middlewares/authenticateOwner');
const bcrypt = require('bcrypt');
const validator = require('validator');
const cookieParser = require('cookie-parser');

ownerProfileRouter.use(cookieParser());
ownerProfileRouter.get('/view', ownerAuth, async (req, res) => {
    try {
        const user = req.owner
        res.json({
            "message": "Welcome " + user.firstName,
            OwnerInfo: user
        });
    } catch (err) {
        console.log(err)
    }
});

ownerProfileRouter.put('/edit', ownerAuth, async (req, res) => {
    try {
        const editableFields = ['firstName','dob','gender', 'age', 'mobile', 'address', 'email', 'bio','lastName'];
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
        res.json({
        message: `${owner.firstName}, Your Profile Updated successfully`,
        owner
        });
    } catch (err) {
        res.status(400).json({"Error": err?.message});
    }
})

ownerProfileRouter.patch('/passwordUpdate', ownerAuth, async (req, res) => {
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
        res.status(200).send(`${req.owner.firstName} Password updated successfully`);
    } catch (err) {
        res.status(400).send(err.message);
    }
})

module.exports = { ownerProfileRouter };