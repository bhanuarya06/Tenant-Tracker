const mongoose = require('mongoose')

const connectDB = async () =>{
    await mongoose.connect('mongodb+srv://vadinapallybhanu90:BcePpSZSFfbieIZv@tenanttracker.2dxthwg.mongodb.net/Owner')
    console.log("Database Connected Sucessfully");
}

module.exports = {connectDB}