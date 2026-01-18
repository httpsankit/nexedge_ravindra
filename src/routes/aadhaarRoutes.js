const express = require('express')
const { 
  createAadhaarEntry, 
  getUserWiseAadhaarData, 
  getCurrentProcessingIds, 
  startProcess,
  uploadQrImage,
  uploadQrImageAgain,
  uploadMiddleware,
  storeOtp,
  getAllAadhaarData,
  getQrImage,
  qrView,
  getAadhaarOtp,
  markSuccess,
  markReject,
  markHold,
  otpByOperator,
  createUser,
  addBalanceToRetailer,
  getAllAadhaarDataOp,
  getAllUserDataOp,
  checkOtpStatusFromOperator,
  getUserDataOp,
  updateAaharStatus,
  refreshUser,
  stopProcess,
  updateCheck
} = require('../controllers/aadhaarController')

const router = express.Router()

router.post('/aadhaar-entry', createAadhaarEntry)
router.post('/get-user-wise-aadhar-data', getUserWiseAadhaarData)
router.get('/current-processing-data', getCurrentProcessingIds)
router.post('/start-process', startProcess)
router.post('/upload-qr', uploadMiddleware, uploadQrImage)
router.post('/upload-qr-again', uploadMiddleware, uploadQrImageAgain)
router.post('/store-otp', storeOtp)
router.get('/get-all-aadhar-data', getAllAadhaarData)
router.post('/get-all-aadhar-data-op', getAllAadhaarDataOp)
router.post('/get-all-user-data-op', getAllUserDataOp)
router.post('/get-user-data-op', getUserDataOp)
router.post('/get-qr-image', getQrImage)
router.post('/qr_view', qrView)
router.post('/get-aadhar-otp', getAadhaarOtp)
router.post('/mark-success', markSuccess)
router.post('/mark-reject', markReject)
router.post('/mark-hold', markHold)
router.post('/otp-sent-by-operator', otpByOperator)
router.post('/create-user', createUser)
router.post('/add-balance-to-retailer', addBalanceToRetailer)
router.post('/check-otp-status-from-operator', checkOtpStatusFromOperator)
router.post('/update-aadhar-status', updateAaharStatus)
router.post('/refreshuser', refreshUser)
router.post('/stop-process', stopProcess)
router.get('/update-check', updateCheck)


module.exports = router
