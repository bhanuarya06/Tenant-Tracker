const express = require('express');
const {connectDB} = require('./config/connectDB');
const PORT = process.env.PORT || 3000;
const app = express();
const {authRouter} = require('./router/auth')
const {profileRouter} = require('./router/profile')

app.use(express.json());
app.use('/',authRouter);
app.use('/owner',profileRouter);

connectDB().then(() => {
    app.listen(3000, () => {
        console.log(`App is sucessfully listening on port ${PORT}`)
    });
}).catch((err) => {
    console.log(err)
})
