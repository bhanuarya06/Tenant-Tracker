const express = require("express");
const { ownerAuth } = require("../../middlewares/authenticateOwner");
const billTenantRouter = express.Router();
const {billModel, tenantModel} = require("../../schema/tenant");
const cookieParser = require("cookie-parser");

billTenantRouter.use(cookieParser());
billTenantRouter.post('/', ownerAuth, async(req,res)=>{
    try{
        const {_id} = req.body;
        const tenant = await tenantModel.findOne({_id:_id});
        const {rent, balance, memberCount} = tenant;
        const watertankerBill = (req.body?.watertankerBill)/memberCount;
        const motorBill = (req.body?.motorBill)/memberCount;
        const waterBill = parseInt(req.body?.waterBill) || 0;
        const powerBill = parseInt(req.body?.powerBill) || 0;
        const garbageBill = parseInt(req.body?.garbageBill) || 0;
        const totalBill =  rent + balance + watertankerBill + waterBill
         + powerBill + garbageBill + motorBill;
        const tenantData = new billModel({
            month : new Date().toLocaleString('default', { month: 'long' }),
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
    await tenantData.save();
    res.status(200).send({message: "Tenant Added Succesfully"});
    }catch(err){
        res.status(500).send({message:err});
    }
});

module.exports = {billTenantRouter};