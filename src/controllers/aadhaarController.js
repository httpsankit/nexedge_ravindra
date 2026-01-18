const pool = require('../db/pool')
const multer = require('multer')
const path = require('path')

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/')
  },
  filename: (req, file, cb) => {
    // Filename will be aadhaarnumber.png
    const aadhaarnumber = req.body.aadhaarnumber
    if (aadhaarnumber) {
      cb(null, `${aadhaarnumber}.png`)
    } else {
      cb(new Error('Missing aadhaarnumber for filename'), null)
    }
  }
})

const upload = multer({ storage: storage })

const createAadhaarEntry = async (req, res) => {
  const {
    aadhaarnumber,
    aadhaarmobilenumber,
    aadharname,
    state,
    username,
    distributorid
  } = req.body;

  if (
    !aadhaarnumber ||
    !aadhaarmobilenumber ||
    !aadharname ||
    !state ||
    !username ||
    !distributorid
  ) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 🔍 1. Fetch user balance
    const userQuery = `
      SELECT totalamount, usedamount
      FROM public.users
      WHERE username = $1
      FOR UPDATE
    `;
    const userRes = await client.query(userQuery, [username]);

    if (userRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "User not found" });
    }

    const totalAmount = parseInt(userRes.rows[0].totalamount, 10);
    // const usedAmount = parseInt(userRes.rows[0].usedamount, 10);

    // ❌ Low balance
    if (totalAmount <= 0) {
      await client.query("ROLLBACK");
      return res.status(402).json({
        error: "Low balance, please recharge"
      });
    }

    // ➕ 2. Update used amount
    const newUsedAmount = totalAmount - 1;

    const updateUserQuery = `
      UPDATE public.users
      SET totalamount = $1,
          updatedat = timezone('Asia/Kolkata', now())
      WHERE username = $2
    `;
    await client.query(updateUserQuery, [
      newUsedAmount.toString(),
      username
    ]);

    // 🧾 3. Insert Aadhaar entry
    const insertAadhaarQuery = `
      INSERT INTO public.aadhar_data
      (aadharnumber, mobilenumber, aadharname, state, username, distributorid)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const values = [
      aadhaarnumber,
      aadhaarmobilenumber,
      aadharname,
      state,
      username,
      distributorid
    ];

    const { rows } = await client.query(insertAadhaarQuery, values);

    await client.query("COMMIT");

    return res.status(201).json({
      message: "Aadhaar entry created successfully",
      data: rows[0],
      remainingBalance: totalAmount - newUsedAmount
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error creating aadhaar entry:", err);
    return res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
};


const getUserWiseAadhaarData = async (req, res) => {
  const { username } = req.body

  if (!username) {
    return res.status(400).json({ error: 'Missing username' })
  }

  try {
    const q = 'SELECT * FROM public.aadhar_data WHERE username = $1 ORDER BY id DESC'
    const { rows } = await pool.query(q, [username])
    return res.json({ success: true, data: rows })
  } catch (err) {
    console.error('Error fetching user aadhaar data:', err)
    return res.status(500).json({ error: 'Server error' })
  }
}

const getCurrentProcessingIds = async (req, res) => {
  try {
    // Assuming 'proxessing' was a typo for 'processing', but checking for both just in case
    const q = "SELECT id FROM public.aadhar_data WHERE status = 'processing'"
    const { rows } = await pool.query(q)
    
    const ids = rows.map(row => row.id).join(',')
    return res.json({ ids })
  } catch (err) {
    console.error('Error fetching processing ids:', err)
    return res.status(500).json({ error: 'Server error' })
  }
}
const updateCheck = async (req, res) => {
  try {
    const q = `
      SELECT *
      FROM public.msg
      ORDER BY id DESC
      LIMIT 1
    `;

    const { rows } = await pool.query(q);

    if (rows.length === 0) {
      return res.json({ success: false });
    }

    return res.json({
      success: true,
      data: rows[0]
    });
  } catch (err) {
    console.error('Error updateCheck', err);
    return res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};


const startProcess = async (req, res) => {
  const { id, operatorid } = req.body

  if (!id || !operatorid) {
    return res.status(400).json({ error: 'Missing id or operatorid' })
  }

  try {
    const q = `
      UPDATE public.aadhar_data 
      SET status = 'processing', operatorid = $1, updatedat = timezone('Asia/Kolkata'::text, now())
      WHERE id = $2 
      RETURNING *
    `
    const { rows } = await pool.query(q, [operatorid, id])

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Record not found' })
    }

    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    console.error('Error starting process:', err)
    return res.status(500).json({ error: 'Server error' })
  }
}

const updateAaharStatus = async (req, res) => {
  const { aadharnumber, mobilenumber, msg } = req.body

  if (!aadharnumber || !mobilenumber) {
    return res.status(400).json({ error: 'Missing aadharnumber or mobilenumber' })
  }

  try {
    const q = `
      UPDATE public.aadhar_data 
      SET status = $1, updatedat = timezone('Asia/Kolkata'::text, now())
      WHERE aadharnumber = $2 AND mobilenumber = $3
      RETURNING *
    `
    const { rows } = await pool.query(q, [msg, aadharnumber, mobilenumber])
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Record not found' })
    }

    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    console.error('Error updateAaharStatus:', err)
    return res.status(500).json({ error: 'Server error' })
  }
}
const refreshUser = async (req, res) => {
  const { username } = req.body

  if (!username) {
    return res.status(400).json({ error: 'Missing username' })
  }

  try {
    const q = `
      select * from public.users where username = $1
    `
    const { rows } = await pool.query(q, [username])
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Record not found' })
    }

    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    console.error('Error refreshUser:', err)
    return res.status(500).json({ error: 'Server error' })
  }
}

const stopProcess = async (req, res) => {
  const { aadharnumber } = req.body; // yahan ID aa rahi hai string me

  if (!aadharnumber) {
    return res.status(400).json({
      success: false,
      error: 'Missing id'
    });
  }

  const id = parseInt(aadharnumber, 10);

  if (isNaN(id)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid id'
    });
  }

  try {
    const q = `
      UPDATE public.aadhar_data
      SET
        status = 'Not Started',
        qrpath = NULL,
        isqrviewed = false,
        operatorid = NULL,
        updatedat = timezone('Asia/Kolkata'::text, now())
      WHERE id = $1
      RETURNING *
    `;

    const { rows } = await pool.query(q, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Record not found'
      });
    }

    return res.json({
      success: true,
      data: rows[0]
    });

  } catch (err) {
    console.error('Error stopProcess:', err);
    return res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};



const uploadQrImage = async (req, res) => {
  const { aadhaarnumber, mobilenumber } = req.body
  const file = req.file

  if (!aadhaarnumber || !mobilenumber || !file) {
    return res.status(400).json({ success: false, error: 'Missing required fields or file' })
  }

  try {
    const qrpath = file.path.replace(/\\/g, '/') // Ensure forward slashes for path

    const q = `
      UPDATE public.aadhar_data 
      SET qrpath = $1, updatedat = timezone('Asia/Kolkata'::text, now()), status = 'processing'
      WHERE aadharnumber = $2 AND mobilenumber = $3
      RETURNING *
    `
    const { rows } = await pool.query(q, [qrpath, aadhaarnumber, mobilenumber])

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Record not found' })
    }

    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    console.error('Error uploading QR:', err)
    return res.status(500).json({ success: false, error: 'Server error' })
  }
}

const uploadQrImageAgain = async (req, res) => {
  const { aadhaarnumber, mobilenumber } = req.body
  const file = req.file

  if (!aadhaarnumber || !mobilenumber || !file) {
    return res.status(400).json({ success: false, error: 'Missing required fields or file' })
  }

  try {
    const qrpath = file.path.replace(/\\/g, '/') // Ensure forward slashes for path

    const q = `
      UPDATE public.aadhar_data 
      SET qrpath = $1, updatedat = timezone('Asia/Kolkata'::text, now()), status = 'qr-resend'
      WHERE aadharnumber = $2 AND mobilenumber = $3
      RETURNING *
    `
    const { rows } = await pool.query(q, [qrpath, aadhaarnumber, mobilenumber])

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Record not found' })
    }

    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    console.error('Error uploading QR:', err)
    return res.status(500).json({ success: false, error: 'Server error' })
  }
}

const storeOtp = async (req, res) => {
  const { aadharnumber, mobilenumber, otp, distributorid, username } = req.body

  if (!aadharnumber || !mobilenumber || !otp || !distributorid || !username) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields'
    })
  }

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // 1️⃣ Check OTP exists or not
    const checkQ = `
      SELECT id FROM public.otp
      WHERE aadharnumber = $1 AND mobilenumber = $2
      LIMIT 1
    `
    const checkRes = await client.query(checkQ, [aadharnumber, mobilenumber])

    let otpResult

    if (checkRes.rows.length > 0) {
      // 🔁 UPDATE OTP
      const updateQ = `
        UPDATE public.otp
        SET otp = $1,
            distributorid = $2,
            username = $3
        WHERE aadharnumber = $4 AND mobilenumber = $5
        RETURNING *
      `
      const { rows } = await client.query(updateQ, [
        otp,
        distributorid,
        username,
        aadharnumber,
        mobilenumber
      ])
      otpResult = rows[0]
    } else {
      // ➕ INSERT OTP
      const insertQ = `
        INSERT INTO public.otp
        (aadharnumber, mobilenumber, otp, distributorid, username)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `
      const { rows } = await client.query(insertQ, [
        aadharnumber,
        mobilenumber,
        otp,
        distributorid,
        username
      ])
      otpResult = rows[0]
    }

    // 2️⃣ Update aadhar_data status
    const updateAadharQ = `
      UPDATE public.aadhar_data
      SET status = 'Otp Submitted by Retailer',
          updatedat = timezone('Asia/Kolkata'::text, now())
      WHERE aadharnumber = $1 AND mobilenumber = $2
      RETURNING *
    `
    const aadharRes = await client.query(updateAadharQ, [
      aadharnumber,
      mobilenumber
    ])

    await client.query('COMMIT')

    return res.status(200).json({
      success: true,
      otp: otpResult,
      aadhar_data: aadharRes.rows[0]
    })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Error storing/updating OTP:', err)

    return res.status(500).json({
      success: false,
      error: 'Server error'
    })
  } finally {
    client.release()
  }
}


const getAllAadhaarData = async (req, res) => {
  try {
    const q = "SELECT * FROM public.aadhar_data WHERE status = 'processing' OR status = 'Not Started' or status = 'hold' ORDER BY id DESC"
    const { rows } = await pool.query(q)
    return res.json({ success: true, data: rows })
  } catch (err) {
    console.error('Error fetching all getAllAadhaarData:', err)
    return res.status(500).json({ success: false, error: 'Server error' })
  }
}

const  getAllAadhaarDataOp = async (req, res) => {
  const {distributorId} = req.body;
  try {
    const q = "SELECT * FROM public.aadhar_data WHERE distributorid = $1 ORDER BY id DESC"
    const { rows } = await pool.query(q, [distributorId])
    return res.json({ success: true, data: rows })
  } catch (err) {
    console.error('Error fetching getAllAadhaarDataOp:', err)
    return res.status(500).json({ success: false, error: 'Server error' })
  }
}

const getAllUserDataOp = async (req, res) => {
  const {distributorId} = req.body;
  try {
    const q = "SELECT id,usertype,username,name,mobile,email,totalamount,usedamount,distributorid,distributorname,createdat,updatedat FROM public.users WHERE distributorid = $1 ORDER BY id DESC"
    const { rows } = await pool.query(q, [distributorId])
    return res.json({ success: true, data: rows })
  } catch (err) {
    console.error('Error fetching getAllUserDataOp:', err)
    return res.status(500).json({ success: false, error: 'Server error' })
  }
}
const getUserDataOp = async (req, res) => {
  const {aadharnumber,mobilenumber} = req.body;
  try {
    const q = "SELECT * FROM public.aadhar_data WHERE aadharnumber = $1 AND mobilenumber = $2 ORDER BY id DESC;"
    const { rows } = await pool.query(q, [aadharnumber,mobilenumber])
    return res.json({ success: true, data: rows })
  } catch (err) {
    console.error('Error fetching getUserDataOp:', err)
    return res.status(500).json({ success: false, error: 'Server error' })
  }
}
const checkOtpStatusFromOperator = async (req, res) => {
  const { username, aadharnumber, mobilenumber } = req.body;

  if (!username || !aadharnumber || !mobilenumber) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields"
    });
  }

  try {
    const q = `
      SELECT *
      FROM public.aadhar_data
      WHERE username = $1
        AND aadharnumber = $2
        AND mobilenumber = $3
      ORDER BY id DESC
      LIMIT 1
    `;

    const { rows } = await pool.query(q, [
      username,
      aadharnumber,
      mobilenumber
    ]);

    if (rows.length === 0) {
      return res.json({
        success: false,
        message: "No record found"
      });
    }

    return res.json({
      success: true,
      data: rows[0]
    });

  } catch (err) {
    console.error("Error checking OTP status:", err);
    return res.status(500).json({
      success: false,
      error: "Server error"
    });
  }
};


const addBalanceToRetailer = async (req, res) => {
  const { retailerUsername, amount, distributorId } = req.body;

  if (!retailerUsername || !amount || !distributorId) {
    return res.status(400).json({
      success: false,
      error: "Missing retailerUsername or amount or distributorId"
    });
  }

  const amt = parseInt(amount, 10);
  if (isNaN(amt) || amt <= 0) {
    return res.status(400).json({
      success: false,
      error: "Invalid amount"
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /* ---------------------------------------
       STEP 1: CHECK DISTRIBUTOR BALANCE
    --------------------------------------- */
    const distQuery = `
      SELECT totalamount::int AS total, usedamount::int AS used
      FROM public.users
      WHERE username = $1
      FOR UPDATE
    `;

    const distRes = await client.query(distQuery, [distributorId]);

    if (distRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: "Distributor not found"
      });
    }

    const { total, used } = distRes.rows[0];
    const available = total - used;

    if (available < amt) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "Insufficient distributor balance"
      });
    }

    /* ---------------------------------------
       STEP 2: ADD BALANCE TO RETAILER
    --------------------------------------- */
    const retailerQuery = `
      UPDATE public.users
      SET
        totalamount = (totalamount::int + $1)::varchar,
        updatedat = timezone('Asia/Kolkata', now())
      WHERE username = $2 OR mobile = $2
      RETURNING id
    `;

    const retailerRes = await client.query(retailerQuery, [
      amt,
      retailerUsername
    ]);

    if (retailerRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: "Retailer not found"
      });
    }

    /* ---------------------------------------
       STEP 3: UPDATE DISTRIBUTOR USED AMOUNT
    --------------------------------------- */
    const updateDistributor = `
      UPDATE public.users
      SET
        usedamount = (usedamount::int + $1)::varchar,
        updatedat = timezone('Asia/Kolkata', now())
      WHERE username = $2
    `;

    await client.query(updateDistributor, [amt, distributorId]);

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Balance added successfully"
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error adding balance to retailer:", err);

    return res.status(500).json({
      success: false,
      error: "Server error"
    });
  } finally {
    client.release();
  }
};

const createUser = async (req, res) => {
  const {
    distributorUsername,
    distributorName,
    retailerUsername,
    retailerPassword,
    retailerName,
    retailerMobile,
    retailerEmail,
    retailerTotalCoin,
    retailerUsedCoin
  } = req.body;

  if (
    !distributorUsername ||
    !retailerUsername ||
    !retailerPassword ||
    !retailerName ||
    !retailerMobile ||
    !retailerEmail ||
    retailerTotalCoin == null
  ) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields"
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 🔍 0. Check if username OR mobile OR email already exists
    const userExistQuery = `
      SELECT username, mobile, email
      FROM public.users
      WHERE username = $1
         OR mobile = $2
         OR email = $3
    `;
    const userExistRes = await client.query(userExistQuery, [
      retailerUsername,
      retailerMobile,
      retailerEmail
    ]);

    if (userExistRes.rowCount > 0) {
      const existing = userExistRes.rows[0];

      let errorMsg = "User already exists with ";
      if (existing.username === retailerUsername) errorMsg += "username";
      else if (existing.mobile === retailerMobile) errorMsg += "mobile";
      else if (existing.email === retailerEmail) errorMsg += "email";

      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        error: errorMsg
      });
    }

    // 🔍 1. Fetch distributor with lock
    const distributorQuery = `
      SELECT totalamount, usedamount
      FROM public.users
      WHERE username = $1
      FOR UPDATE
    `;
    const distRes = await client.query(distributorQuery, [distributorUsername]);

    if (distRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: "Distributor not found"
      });
    }

    const distributorTotal = parseInt(distRes.rows[0].totalamount, 10);
    const distributorUsed = parseInt(distRes.rows[0].usedamount, 10);
    const transferCoin = parseInt(retailerTotalCoin, 10);

    const distributorAvailable = distributorTotal - distributorUsed;

    if (distributorAvailable < transferCoin) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "Distributor has insufficient balance"
      });
    }

    // ➕ 2. Update distributor used coins
    const updateDistributorQuery = `
      UPDATE public.users
      SET usedamount = (usedamount::int + $1)::varchar,
          updatedat = timezone('Asia/Kolkata', now())
      WHERE username = $2
    `;
    await client.query(updateDistributorQuery, [
      transferCoin,
      distributorUsername
    ]);

    // 👤 3. Create retailer
    const createRetailerQuery = `
      INSERT INTO public.users
      (usertype, username, password, name, mobile, email,
       totalamount, usedamount, distributorid, distributorname)
      VALUES
      ('retailer', $1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, username, mobile, email
    `;

    const retailerValues = [
      retailerUsername,
      retailerPassword, // ⚠️ hash in prod
      retailerName,
      retailerMobile,
      retailerEmail,
      transferCoin.toString(),
      retailerUsedCoin ? retailerUsedCoin.toString() : "0",
      distributorUsername,
      distributorName || ""
    ];

    const { rows } = await client.query(createRetailerQuery, retailerValues);

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      message: "Retailer created successfully",
      data: rows[0]
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Create user error:", err);

    return res.status(500).json({
      success: false,
      error: "Server error"
    });
  } finally {
    client.release();
  }
};

const getQrImage = async (req, res) => {
  const { qrpath } = req.body

  if (!qrpath) {
    return res.status(400).json({ success: false, error: 'Missing qrpath' })
  }

  // Assuming qrpath is relative like 'uploads/1234.png'
  // and we want to serve the file
  const absolutePath = path.resolve(qrpath)
  
  res.sendFile(absolutePath, (err) => {
    if (err) {
      console.error('Error sending file:', err)
      // Check if headers already sent to avoid double response
      if (!res.headersSent) {
        res.status(404).json({ success: false, error: 'File not found' })
      }
    }
  })
}

const qrView = async (req, res) => {
  const { aadharnumber, mobilenumber } = req.body

  if (!aadharnumber || !mobilenumber) {
    return res.status(400).json({ success: false, error: 'Missing required fields' })
  }

  try {
    const q = `
      UPDATE public.aadhar_data 
      SET isqrviewed = true, status = 'qr-viewed', updatedat = timezone('Asia/Kolkata'::text, now())
      WHERE aadharnumber = $1 AND mobilenumber = $2 
      RETURNING *
    `
    const { rows } = await pool.query(q, [aadharnumber, mobilenumber])
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Record not found' })
    }
    
    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    console.error('Error updating qr view status:', err)
    return res.status(500).json({ success: false, error: 'Server error' })
  }
}

const getAadhaarOtp = async (req, res) => {
  const { aadharnumber, mobilenumber } = req.body

  if (!aadharnumber || !mobilenumber) {
    return res.status(400).json({ success: false, error: 'Missing required fields' })
  }

  try {
    // Get the latest OTP for this user
    const q = `
      SELECT otp FROM public.otp 
      WHERE aadharnumber = $1 AND mobilenumber = $2 
      ORDER BY id DESC 
      LIMIT 1
    `
    const { rows } = await pool.query(q, [aadharnumber, mobilenumber])

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'OTP not found' })
    }

    return res.json({ success: true, otp: rows[0].otp })
  } catch (err) {
    console.error('Error fetching OTP:', err)
    return res.status(500).json({ success: false, error: 'Server error' })
  }
}

const otpByOperator = async (req, res) => {
  const { aadharnumber, mobilenumber, isResend } = req.body

  // 🔹 Validation
  if (!aadharnumber || !mobilenumber) {
    return res.status(400).json({
      success: false,
      error: 'Missing aadharnumber or mobilenumber'
    })
  }

  try {
    let q = `
      UPDATE public.aadhar_data
      SET status = 'otp-sent-by-operator',
          updatedat = timezone('Asia/Kolkata'::text, now())
      WHERE aadharnumber = $1
        AND mobilenumber = $2
      RETURNING *
    `
    if(isResend) {
      q = `
      UPDATE public.aadhar_data
      SET status = 'otp-resend',
          updatedat = timezone('Asia/Kolkata'::text, now())
      WHERE aadharnumber = $1
        AND mobilenumber = $2
      RETURNING *
    `
    }

    const { rows } = await pool.query(q, [aadharnumber, mobilenumber])

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Record not found'
      })
    }

    return res.status(200).json({
      success: true,
      data: rows[0]
    })
  } catch (err) {
    console.error('Error in otpByOperator:', err)
    return res.status(500).json({
      success: false,
      error: 'Server error'
    })
  }
}


const markStatus = async (req, res, status) => {
  const { aadharnumber, remarks } = req.body;

  if (!aadharnumber) {
    return res.status(400).json({
      success: false,
      error: "Missing aadharnumber"
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 🔍 1. Fetch retailer username
    const fetchQuery = `
      SELECT username
      FROM public.aadhar_data
      WHERE aadharnumber = $1
      FOR UPDATE
    `;
    const fetchRes = await client.query(fetchQuery, [aadharnumber]);

    if (fetchRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: "Record not found"
      });
    }

    const retailerUsername = fetchRes.rows[0].username;

    // 📝 2. Update status
    const updateAadharQuery = `
      UPDATE public.aadhar_data
      SET status = $1, remarks = $3,
          updatedat = timezone('Asia/Kolkata', now())
      WHERE aadharnumber = $2
      RETURNING *
    `;
    const { rows } = await client.query(updateAadharQuery, [
      status,
      aadharnumber,
      remarks
    ]);

    // ➕ 3. Credit balance ONLY if status is 'reject'
    if (status === "reject") {
      const updateUserQuery = `
        UPDATE public.users
        SET totalamount = (totalamount::int + 1)::varchar,
            updatedat = timezone('Asia/Kolkata', now())
        WHERE username = $1
      `;
      await client.query(updateUserQuery, [retailerUsername]);
    }

    await client.query("COMMIT");

    return res.json({
      success: true,
      message:
        status === "reject"
          ? "Status updated and balance refunded"
          : "Status updated",
      data: rows[0]
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error marking status:", err);
    return res.status(500).json({
      success: false,
      error: "Server error"
    });
  } finally {
    client.release();
  }
};


const markSuccess = (req, res) => markStatus(req, res, 'success')
const markReject = (req, res) => markStatus(req, res, 'reject')
const markHold = (req, res) => markStatus(req, res, 'hold')

module.exports = { 
  createAadhaarEntry, 
  getUserWiseAadhaarData, 
  getCurrentProcessingIds, 
  startProcess,
  uploadQrImage,
  uploadQrImageAgain,
  uploadMiddleware: upload.single('file'),
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
}
