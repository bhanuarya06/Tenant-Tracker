const express = require("express");
const { ownerAuth } = require("../../middlewares/authenticateOwner");
const manageTenantRouter = express.Router();
const {tenantModel} = require("../../schema/tenant");
const {billModel} = require("../../schema/bill");
const cookieParser = require("cookie-parser");

manageTenantRouter.use(cookieParser());
manageTenantRouter.post('/addTenant', ownerAuth, async(req,res)=>{
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
            balance: req.body?.balance,
            rent: req.body?.rent,
            memberCount: req.body?.memberCount,
            owner : req.owner._id 
        });
    await tenantData.save();
    res.status(200).send({message: "Tenant Added Succesfully", responseData: tenantData});
    }catch(err){
        res.status(500).send({message:err});
    }
});

manageTenantRouter.put('/updateTenant', ownerAuth, async(req,res)=>{
    try{
        const {_id} = req.body;
        const tenant = await tenantModel.findOne({_id:_id});
        const uneditableFields = ['_id'];
        Object.keys(req.body).forEach((key) => {
            if (!uneditableFields.includes(key)) {
                tenant[key] = req.body[key]
            }
        })
        await tenant.save();
    res.status(200).send({message: "Tenant Updated Succesfully"});
    }catch(err){
        res.status(500).send({message:err});
    }
});

manageTenantRouter.delete('/deleteTenant', ownerAuth, async(req,res)=>{
    try{
        const {_id} = req.body;
        const tenant = await tenantModel.findOne({_id:_id});
        
        if (!tenant) {
            return res.status(404).send({message: "Tenant not found"});
        }

        if (tenant.owner.toString() !== req.owner._id.toString()) {
            return res.status(403).send({message: "Unauthorized to delete this tenant"});
        }
        
        await tenantModel.findByIdAndDelete(_id);
        
        //await billModel.deleteMany({tenantId: _id});
        
        res.status(200).send({message: "Tenant Deleted Successfully"});
    }catch(err){
        res.status(500).send({message:err});
    }
});

manageTenantRouter.get('/viewTenants', ownerAuth, async(req,res)=>{
    try{
        const {id} = req.owner;
        const tenants = await tenantModel.find({owner:id});
        if (!tenants){
            throw new Error ("No tenants found for the owner");
        }
    res.status(200).send(tenants);
    }catch(err){
        res.status(500).send({message:err});
    }
});

manageTenantRouter.post('/billTenant', ownerAuth, async(req,res)=>{
    try{
        const {_id} = req.body;
        const tenant = await tenantModel.findOne({_id:_id});
        const {rent, balance, memberCount} = tenant;
        const month = req.body?.month || new Date().toLocaleString('default', { month: 'long' });
        const watertankerBill = req.body?.watertankerBill ? parseInt(req.body?.watertankerBill)/memberCount : 0;
        const motorBill = req.body?.motorBill ? parseInt(req.body?.motorBill)/memberCount : 0;
        const waterBill = parseInt(req.body?.waterBill) || 0;
        const powerBill = parseInt(req.body?.powerBill) || 0;
        const garbageBill = parseInt(req.body?.garbageBill) || 0;
        const totalBill =  parseInt(rent) + parseInt(balance) + watertankerBill + waterBill
         + powerBill + garbageBill + motorBill;
        const billdata = new billModel({
            tenantId: _id,
            month : month,
            rent : tenant?.rent,
            watertankerBill : watertankerBill,
            waterBill : waterBill,
            powerBill : powerBill,
            garbageBill : garbageBill,
            motorBill : motorBill,
            balance : balance,
            totalBill : totalBill,
            status : req.body?.status === 'ADD' ? 'PENDING' : 'PAID'
        });
    await billdata.save();
    res.status(200).send({message: "Tenant bill Added Succesfully"});
    }catch(err){
        res.status(500).send({message:err});
    }
});

manageTenantRouter.put('/updateBill', ownerAuth, async(req,res)=>{
    try{
        const {_id, month} = req.body;
        const tenant = await tenantModel.findOne({_id:_id});
        const {rent, balance, memberCount} = tenant;
        const watertankerBill = req.body?.watertankerBill ? parseInt(req.body?.watertankerBill)*memberCount : 0;
        const motorBill = req.body?.motorBill ? parseInt(req.body?.motorBill)*memberCount : 0;
        const waterBill = parseInt(req.body?.waterBill) || 0;
        const powerBill = parseInt(req.body?.powerBill) || 0;
        const garbageBill = parseInt(req.body?.garbageBill) || 0;
        const totalBill =  parseInt(rent) + parseInt(balance) + watertankerBill + waterBill
         + powerBill + garbageBill + motorBill;
        const presentMonth = month || new Date().toLocaleString('default', { month: 'long' });
        await billModel.findOneAndUpdate(
            { tenantId: _id, month: presentMonth },
            {
                watertankerBill: watertankerBill,
                waterBill: waterBill,
                powerBill: powerBill,
                garbageBill: garbageBill,
                motorBill: motorBill,
                balance: balance,
                totalBill: totalBill,
                status: req.body?.status
            },
            { new: true, upsert: true }
        );
        res.status(200).send({message: "Tenant bill updated Succesfully"});``
    }catch(err){
        res.status(500).send({message:err});
    }
});

manageTenantRouter.post('/viewRentHistory', ownerAuth, async(req,res)=>{
    try{
        const {tenantId} = req.body;
        const tenantRentHistory = await billModel.find({tenantId: tenantId});
        if (!tenantRentHistory){
            throw new Error ("No tenants found for the owner");
        }
        res.status(200).send(tenantRentHistory);
    }catch(err){
        res.status(500).send({message:err});
    }
});

module.exports = {manageTenantRouter};