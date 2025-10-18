const mongoose = require("mongoose");
const { Schema } = mongoose;

const bill = new Schema({
  tenantId: {
    type: String,
    required: true,
  },
  month: {
    type: String,
    required: true,
  },
  rent: { type: String, required: true },
  watertankerBill: { type: String },
  waterBill: { type: String },
  powerBill: { type: String },
  garbageBill: { type: String },
  motorBill: { type: String },
  balance: { type: String },
  totalBill: { type: String },
  status: { type: String, required: true },
});

// Compound unique index for tenantId + month
bill.index({ tenantId: 1, month: 1 }, { unique: true });

const billModel = mongoose.model("bill", bill);

module.exports = { billModel };
