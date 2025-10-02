const express = require('express');
const connectionAuthTenRouter = express.Router();
const { tenantAuth } = require('../../middlewares/authenticateTenant');
const { tenantModel } = require('../../schema/tenant');
const cookieParser = require('cookie-parser');
const { ConnectionRequestModel } = require('../../schema/connections');

connectionAuthTenRouter.use(cookieParser())
connectionAuthTenRouter.get('/availableTenants', tenantAuth, async (req, res) => {
    try {
        const tenantsList = await tenantModel.find({ 
            owner: req.tenant.owner,
            _id: { $ne: req.tenant._id }
        });
        const tenIds = tenantsList.map(ten => ten._id.toString());
        const addedTenants = await ConnectionRequestModel.find({
            fromUserId: req.tenant._id,
            toUserId: { $in: tenIds }
        });
        const addedTensUserIds = addedTenants.map(ten=>ten.toUserId.toString());
        const availableTenIds = tenIds.filter(ten => !addedTensUserIds.includes(ten));
        const tenants = await tenantModel.find({ _id: { $in: availableTenIds } });
        const data = tenants.map(tenant => ({
            _id: tenant._id,
            firstName: tenant.firstName,
            lastName: tenant.lastName,
            roomNum: tenant.roomNum
        }));

        res.json({ message: "The added tenants", tenants: data });
    } catch (err) {
        res.status(400).send(err.message);
    }
});

connectionAuthTenRouter.get('/addedTenants', tenantAuth, async (req, res) => {
    try {
        const tenantsList = await ConnectionRequestModel.find({
            fromUserId: req.tenant._id
        });
        const tenToUserIds = tenantsList.map(ten=>ten.toUserId);
        const tenants = await tenantModel.find({_id:{ $in: tenToUserIds}})
        const data = tenants.map((tenant) => ({
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

connectionAuthTenRouter.post('/add/:tenantId', tenantAuth, async (req,res)=>{
    try{
        const {tenantId} = req.params;
        const validTenantId = await tenantModel.findById(tenantId);
        if (!validTenantId){
            res.status(400).send("Tenant is not valid");
        }
        const logedinTenant = req.tenant;
        if (logedinTenant._id === tenantId){
            res.status(400).send("You cannot add yourself");
        }
        const connectionReq = new ConnectionRequestModel({
            fromUserId:logedinTenant._id,
            toUserId:tenantId,
            status: 'Added'
        });
        await connectionReq.save();
        res.status(200).send("Added successfully");
    }catch (err) {
        res.status(400).send(err.message);
    }
})

module.exports = { connectionAuthTenRouter };