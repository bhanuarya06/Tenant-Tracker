const express = require('express');
const cors = require('cors');
const {connectDB} = require('./config/connectDB');
const PORT = process.env.PORT || 3000;
const app = express();
const {ownerAuthRouter} = require('./router/owner/ownerAuth')
const {tenantAuthRouter} = require('./router/tenant/tenantAuth')
const {ownerProfileRouter} = require('./router/owner/ownerProfile')
const {tenantProfileRouter} = require('./router/tenant/tenantProfile');
const { connectionAuthRouter } = require('./router/owner/connectionRequest');
const { connectionAuthTenRouter } = require('./router/tenant/connectionReqTenants');


app.use(cors({
  origin: "http://localhost:5173",
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

app.use(express.json());
app.use('/tenant/auth',tenantAuthRouter);
app.use('/owner/auth',ownerAuthRouter);
app.use('/owner/profile',ownerProfileRouter);
app.use('/tenant/profile',tenantProfileRouter);
app.use('/owner/available',connectionAuthRouter)
app.use('/tenant/available',connectionAuthTenRouter)

app.post('/logout',(req,res)=>{
    res.clearCookie('token');
    res.status(200).send(`Logged out successfully`)
})

connectDB().then(() => {
    app.listen(3000, () => {
        console.log(`App is sucessfully listening on port ${PORT}`)
    });
}).catch((err) => {
    console.log(err)
})
