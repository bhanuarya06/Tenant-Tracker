const express = require("express");
const { ownerAuth } = require("../../middlewares/authenticateOwner");
const addTenantRouter = express.Router();
const {tenantModel} = require("../../schema/tenant");
const cookieParser = require("cookie-parser");

addTenantRouter.use(cookieParser());
addTenantRouter.post('/', ownerAuth, async(req,res)=>{
    try{
        const tenantData = new tenantModel({
            firstName : req.body?.firstName,
            lastName : req.body?.lastName,
            dob : req.body?.dob,
            gender : req.body?.gender,
            email : req.body?.email,
            mobile : req.body?.mobile,
            ocupation : req.body?.ocupation,
            bio : req.body?.bio,
            roomNum : req.body?.roomNum,
            owner : req.owner._id 
        });
    await tenantData.save();
    res.status(200).send({message: "Tenant Added Succesfully"});
    }catch(err){
        res.status(500).send({message:err});
    }
});

module.exports = {addTenantRouter};