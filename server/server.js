const express = require('express')
const cors = require('cors')
const app = express()
const PORT = 3000

app.use(cors())

cors({
  accessControlAllowOrigin: '*',
})

app.get('/', (req, res) => {
  res.json({ message: 'Hello from the server!' })
})

app.get('/api/classify', async (req, res) => {
  try {
    const {name} = req.query
    res.setHeader('Access-Control-Allow-Origin', '*')
    
    if (!name  || name.trim().length === 0 || name === "''") 
      return res.status(400).json({status: "error", message: "Missing or empty name parameter"})
    
    if (typeof name !== "string")
       return res.status(422).json({status: "error", message: "Name is not a string"})
    
    const UTCDate = new Date().toISOString()
    const apiRes = await fetch(
      `https://api.genderize.io?name=${encodeURIComponent(name)}`,
      {
        method: "GET",
      },
    )
    const apiData = await apiRes.json()
    
    const response = {
      name,
      gender: apiData?.gender,
      probability: apiData?.probability,
      sampleSize: apiData?.count,
      isConfident: apiData?.probability >= 0.7 && apiData?.count >=100,
      processedAt: UTCDate 
    }

    
    if (!apiData.gender || !apiData.count) return res.status(404).json({status: "error", message: "No apiData or prediction available for the provided name"})

    
    res.status(200).json({
      status: "success",
      data: response
    })

  } catch (error) {
    res.status(500).json({
      status: 'error',
      error:  'An error occurred while processing the request.' 
    })
  }

})

app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`))

module.exports = app