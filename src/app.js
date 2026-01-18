const express = require('express')
const authRoutes = require('./routes/authRoutes')
const aadhaarRoutes = require('./routes/aadhaarRoutes')
const app = express()
app.use(express.json())
app.use('/auth', authRoutes)
app.use('/', aadhaarRoutes)
module.exports = app
