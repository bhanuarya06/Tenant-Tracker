const express = require('express');
const connectionAuthRouter = express.Router();
const { ownerAuth } = require('../../middlewares/authenticateOwner');
const { tenantModel } = require('../../schema/tenant');
const cookieParser = require('cookie-parser');
const { ConnectionRequestModel } = require('../../schema/connections');

connectionAuthRouter.use(cookieParser())
connectionAuthRouter.get('/viewTenants', ownerAuth, async (req, res) => {
    try {
        const tenantsList = await tenantModel.find({owner:req.owner._id});
        const data = tenantsList.map((tenant) => ({
            _id:tenant._id,
            firstName: tenant.firstName,
            lastName: tenant.lastName,
            roomNum: tenant.roomNum
        }));
        res.json({ message: "The added tenants", tenants: data })
    } catch (err) {
        res.status(400).send(err.message);
    }
})

connectionAuthRouter.get('/addTenants', ownerAuth, async (req, res) => {
    try {
        const tenantsList = await tenantModel.find({
            owner: undefined
        });
        const data = tenantsList.map((tenant) => ({
            _id:tenant._id,
            firstName: tenant.firstName,
            lastName: tenant.lastName,
            roomNum: tenant.roomNum,
            bio: tenant.bio
        }));
        res.json({ message: "The available tenants", tenants: data })
    } catch (err) {
        res.status(400).send(err.message);
    }
})

connectionAuthRouter.post('/add/:tenantId', ownerAuth, async (req,res)=>{
    try{
        const {tenantId} = req.params;
        const validTenantId = await tenantModel.findById(tenantId);
        if (!validTenantId){
            res.status(400).send("Tenant is not valid");
        }
        const logedinOwner = req.owner;
        if (logedinOwner._id === tenantId){
            res.status(400).send("You cannot add yourself");
        }
        const connectionReq = new ConnectionRequestModel({
            fromUserId:logedinOwner._id,
            toUserId:tenantId,
            status: 'Added'
        });
        await tenantModel.findByIdAndUpdate(tenantId,{owner : logedinOwner._id});
        await connectionReq.save();
        res.status(200).send("Added successfully");
    }catch (err) {
        res.status(400).send(err.message);
    }
})

module.exports = { connectionAuthRouter };