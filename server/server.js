const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const Profile = require('./models/profileModel')
const json = require('./seed_profiles.json')
require('dotenv').config()

const profileRoutes = require('./routes/profileRoutes')

const app = express()
const PORT = process.env.PORT || 3000
let connectionPromise = null

app.use(cors())
app.use(cookieParser())
app.use(express.json())

const connectDB = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set')
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection
  }

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(process.env.MONGODB_URI)
  }

  try {
    await connectionPromise
    return mongoose.connection
  } catch (error) {
    connectionPromise = null
    throw error
  }
}

app.get('/', (req, res) => {
  res.json({ message: 'Hello from the server!' })
})

app.get('/api/classify', async (req, res) => {
  try {
    await connectDB()

    const { name } = req.query
    res.setHeader('Access-Control-Allow-Origin', '*')

    if (!name || name.trim().length === 0 || name === "''") {
      return res.status(400).json({ status: 'error', message: 'Missing or empty name parameter' })
    }

    if (typeof name !== 'string') {
      return res.status(422).json({ status: 'error', message: 'Name is not a string' })
    }

    const apiRes = await fetch(`https://api.genderize.io?name=${encodeURIComponent(name)}`)
    const apiData = await apiRes.json()

    if (!apiData.gender || !apiData.count) {
      return res.json({ status: 'error', message: 'No apiData or prediction available for the provided name' })
    }

    const response = {
      name,
      gender: apiData.gender,
      probability: apiData.probability,
      sample_Size: apiData.count,
      is_confident: apiData.probability >= 0.7 && apiData.count >= 100,
      processed_at: new Date().toISOString()
    }

    return res.status(200).json({
      status: 'success',
      data: response
    })
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'An error occurred while processing the request.'
    })
  }
})

app.use('/api', async (req, res, next) => {
  try {
    await connectDB()
    next()
  } catch (error) {
    next(error)
  }
})

app.use('/api', profileRoutes)
// app.use('/api/v1', profileRoutes)

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error)
  }

  return res.status(500).json({
    status: 'error',
    message: error.message || 'Internal server error'
  })
})

const seedData = async () => {
  await connectDB()

  const allNames = json.map((profile) => profile.name.trim().toLowerCase())
  const existingProfiles = await Profile.find({ name: { $in: allNames } }).select('name')
  const existingNames = existingProfiles.map((profile) => profile.name)
  const profilesToInsert = []

  for (const profile of json) {
    const normalizedName = profile.name.trim().toLowerCase()

    if (!existingNames.includes(normalizedName)) {
      profilesToInsert.push({
        name: normalizedName,
        gender: profile.gender,
        gender_probability: profile.gender_probability,
        age: profile.age,
        age_group: profile.age_group,
        country_id: profile.country_id,
        country_name: profile.country_name,
        country_probability: profile.country_probability
      })
    }
  }

  if (profilesToInsert.length > 0) {
    await Profile.insertMany(profilesToInsert)
    console.log(`${profilesToInsert.length} profiles inserted into database`)
    return
  }

  console.log('Database already seeded')
}

if (require.main === module && process.env.ENVIRONMENT !== 'production') {
  connectDB()
    .then(() => {
      console.log('Connected to database')
      app.listen(PORT, () => console.log(`Local server running on port ${PORT}`))
    })
    .then(() => seedData())
    .catch((error) => {
      console.error('Database connection failed:', error.message)
    })
}

app.connectDB = connectDB
app.seedData = seedData

module.exports = app
