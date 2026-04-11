const express = require('express')
const cors = require('cors')
const app = express()
const PORT = 3000
require('dotenv').config()

app.use(cors())

cors({
  accessControlAllowOrigin: '*',
})

app.get('/', (req, res) => {
  res.json({ message: 'Hello from the server!' })
})


app.get('/api/classify', async (req, res) => {

  try {
    const { name } = req.query
    res.setHeader('Access-Control-Allow-Origin', '*')

    if (!name || name.trim().length === 0 || name === "''") 
      return res.status(400).json({ status: "error", message: "Missing or empty name parameter" })

    if (typeof name !== "string")
      return res.status(422).json({ status: "error", message: "Name is not a string" })

    
    const apiRes = await fetch(`https://api.genderize.io?name=${encodeURIComponent(name)}`)
    
    const apiData = await apiRes.json()
    
    if (!apiData.gender || !apiData.count) 
      return res.json({ status: "error", message: "No apiData or prediction available for the provided name" })
    
    const UTCDate = new Date().toISOString()

    const response = {
      name,
      gender: apiData?.gender,
      probability: apiData?.probability,
      sample_Size: apiData?.count,
      is_confident: apiData?.probability >= 0.7 && apiData?.count >= 100,
      processed_at: UTCDate
    }

    res.status(200).json({
      status: "success",
      data: response
    })

  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: 'An error occurred while processing the request.'
    })
  }
})


// Only listen when running locally (e.g., for testing)
if (process.env.ENVIRONMENT !== 'production') {
  const PORT = process.env.PORT || 3000
  app.listen(PORT, () => console.log(`Local server running on port ${PORT}`))
}

module.exports = app