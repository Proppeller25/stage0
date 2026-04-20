const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
const crypto = require('crypto')
const app = express()
const PORT = process.env.PORT || 3000
const json = require('./seed_profiles.json')
require('dotenv').config()
const importedDataModel = require('./models/profileModel')
let connectionPromise = null

const uuidv7 = () => {
  const bytes = crypto.randomBytes(16)
  const time = BigInt(Date.now())

  bytes[0] = Number((time >> 40n) & 0xffn)
  bytes[1] = Number((time >> 32n) & 0xffn)
  bytes[2] = Number((time >> 24n) & 0xffn)
  bytes[3] = Number((time >> 16n) & 0xffn)
  bytes[4] = Number((time >> 8n) & 0xffn)
  bytes[5] = Number(time & 0xffn)
  bytes[6] = (0x70 | (bytes[6] & 0x0f))
  bytes[8] = (0x80 | (bytes[8] & 0x3f))

  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const createDataModel = () => {
  const dataSchema = new mongoose.Schema(
    {
      id: {
        type: String,
        default: uuidv7,
      },
      name: {
        type: String,
        required: true,
        unique: true,
      },
      gender: {
        type: String,
        required: true,
        enums: ['male', 'female']
      },
      gender_probability: {
        type: Number,
        required: true,
      },
      sample_size: {
        type: Number,
        required: false,
      },
      age: {
        type: Number,
        required: true,
      },
      age_group: {
        type: String,
        required: true,
        enums: ['child', 'teenager', 'adult', 'senior']
      },
      country_id: {
        type: String,
        required: true,
      },
      country_name: {
        type: String,
        required: false
      },
      country_probability: {
        type: Number,
        required: true,
      },
    },
    {
      timestamps: {
        createdAt: 'created_at',
        updatedAt: 'updated_at'
      },
    }
  )

  return mongoose.models.Profile || mongoose.model('Profile', dataSchema)
}

const Profile = typeof importedDataModel?.findOne === 'function'
  ? importedDataModel
  : createDataModel()

app.use(cors())
app.use(express.json())



/// utility functions
const classifyAge = (age) => {
  let ageGroup

  if (age >= 0 && age <= 12) ageGroup = 'child'
  else if (age > 12 && age <= 19) ageGroup = 'teenager'
  else if (age > 19 && age <= 59) ageGroup = 'adult'
  else if (age >= 60) ageGroup = 'senior'

  return ageGroup
}

const getHighestProbability = (data) => {
  data.sort((a, b) => b.probability - a.probability)
  return data[0]
}

const getCountryFullName = (countryId) => {
  const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
  return regionNames.of(countryId)
}

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
const formatProfile = (profile) => ({
  id: profile.id,
  name: profile.name,
  gender: profile.gender,
  gender_probability: profile.gender_probability,
  sample_size: profile.sample_size,
  age: profile.age,
  age_group: profile.age_group,
  country_id: profile.country_id,
  country_name: profile.country_name || getCountryFullName(profile.country_id),
  country_probability: profile.country_probability,
  created_at: new Date(profile.created_at).toISOString()
})

const formatProfileSummary = (profile) => ({
  id: profile.id,
  name: profile.name,
  gender: profile.gender,
  age: profile.age,
  age_group: profile.age_group,
  country_id: profile.country_id
})

const invalidExternalResponse = (res, externalApi) => (
  res.status(502).json({
    status: 'error',
    message: `${externalApi} returned an invalid response`
  })
)

app.get('/', (req, res) => {
  res.json({ message: 'Hello from the server!' })
})


app.get('/api/classify', async (req, res) => {

  try {
    await connectDB()
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

app.post('/api/profiles', async(req, res) => {
  try{
    await connectDB()
    const {name} = req.body || {}
    res.setHeader('Access-Control-Allow-Origin', '*')
    
    if (name === undefined || name === null || (typeof name === "string" && name.trim().length === 0 || name === "''")) 
      return res.status(400).json({ status: "error", message: "Missing or empty name" })

    if (typeof name !== "string")
      return res.status(422).json({ status: "error", message: "Invalid type" })

    const normalizedName = name.trim().toLowerCase()

    const genderResponse = await fetch(`https://api.genderize.io?name=${encodeURIComponent(normalizedName)}`)
    const ageResponse = await fetch(`https://api.agify.io?name=${encodeURIComponent(normalizedName)}`)
    const countryResponse = await fetch(`https://api.nationalize.io?name=${encodeURIComponent(normalizedName)}`)

    if (!genderResponse.ok) return invalidExternalResponse(res, 'Genderize')
    if (!ageResponse.ok) return invalidExternalResponse(res, 'Agify')
    if (!countryResponse.ok) return invalidExternalResponse(res, 'Nationalize')

    const genderData = await genderResponse.json()
    const ageData = await ageResponse.json()
    const countryData = await countryResponse.json()
    

    if (genderData.gender == null || genderData.count === 0) 
      return invalidExternalResponse(res, 'Genderize')
    
    if (ageData.age == null) 
      return invalidExternalResponse(res, 'Agify')

    if (!countryData.country || countryData.country.length === 0) 
      return invalidExternalResponse(res, 'Nationalize')

    const highestProbabilityCountry = getHighestProbability(countryData.country)

    const compiledData = {
      name: normalizedName,
      gender:genderData.gender,
      gender_probability: genderData.probability,
      sample_size:genderData.count,
      age:ageData.age,
      age_group: classifyAge(ageData.age),
      country_id: highestProbabilityCountry.country_id,
      country_name: getCountryFullName(highestProbabilityCountry.country_id),
      country_probability: highestProbabilityCountry.probability
    }

    const existingData = await Profile.findOne({name: normalizedName})
    
    if(existingData)
      return res.status(200).json({status:"success", message:"Profile already exists", data: formatProfile(existingData)}) 

    const savedData = new Profile (compiledData)

    await savedData.save()
    
    
    res.status(201).json({
      status: "success",
      data: formatProfile(savedData)
    })

  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message || "Server Error"
    })
  }
})

app.get('/api/profiles/:id', async (req, res) => {
  try{
    const {id} = req.params
    await connectDB()
    res.setHeader('Access-Control-Allow-Origin', '*')

    const foundData = await Profile.findById(id)

    if(!foundData) return res.status(404).json({status: "error", message: "Profile not found"})

    res.status(200).json({
      status: "success",
      data: formatProfile(foundData)
    })

  } catch(error) {
    return res.status(500).json({
      status: "error",
      message: error.message || "Upstream or Server Failure"
    })
  }
})

app.get('/api/profiles', async (req, res) => {
  try{
    await connectDB()
    res.setHeader('Access-Control-Allow-Origin', '*')
    const {gender, country_id, age_group, min_age, max_age, min_gender_probability, min_country_probability, sort_by = 'created_at', order, page = 1, limit = 10} = req.query
    const filters = {}
    let sortOrder
    let sortQuery
    let skip
    const maxPaqeLimit = 50
    const sortingOptions = ['created_at', 'age', 'gender_probability']
    const orderOptions = ['asc', 'desc']

    if (gender) {
      filters.gender = gender.trim().toLowerCase()
    }
    if (country_id) {
      filters.country_id = country_id.trim()
    }
    if (age_group) {
      filters.age_group = age_group.trim().toLowerCase()
    }
    if (min_age) {
      if (!filters.age) filters.age = {}
      filters.age.$gte = Number(min_age)
    }
    if (max_age) {
      if (!filters.age) filters.age = {}
      filters.age.$lte = Number(max_age)
    }
    if (min_gender_probability) filters.gender_probability = { $gte: Number(min_gender_probability)}
    if (min_country_probability) filters.country_probability = { $gte: Number(min_country_probability)}

    if (sort_by) {
      if (!sortingOptions.includes(sort_by)) return res.status(400).json({status: "error", message: `Invalid sort_by value. Allowed values are: ${sortingOptions.join(', ')}`})
      if (order && !orderOptions.includes(order)) return res.status(400).json({status: "error", message: `Invalid order value. Allowed values are: ${orderOptions.join(', ')}`})

      sortOrder = order === 'desc' ? -1 : 1
      sortQuery = { [sort_by]: sortOrder }
    }
    if (page && limit) {
      const pageNumber = Number(page)
      const limitNumber = Number(limit) > 50 ? maxPaqeLimit : Number(limit)
      skip = (pageNumber - 1) * limitNumber
    }
    
    

    const foundData = await Profile.find(filters).sort(sortQuery).skip(skip || 0).limit(Number(limit) || 0)

    if(!foundData || foundData.length === 0)
      return res.status(404).json({status: "error", message: "No profiles found matching the criteria"})

    res.status(200).json({
      status: "success",
      page: Number(page) || 1,
      limit: Number(limit) || foundData.length,
      total: foundData.length,
      data: foundData.map(formatProfile)
    })

  } catch(error) {
    return res.status(500).json({
      status: "error",
      message: error.message || "Upstream or Server Failure"
    })
  }
})


app.delete('/api/profiles/:id', async (req, res) => {
  try{
    const {id} = req.params
    res.setHeader('Access-Control-Allow-Origin', '*')
    await connectDB()

    const deletedData = await Profile.findByIdAndDelete(id) 

    if(!deletedData) return res.status(404).json({status: "error", message: "Profile not found"})

    return res.status(204).send()

  } catch(error) {
    return res.status(500).json({
      status: "error",
      message: error.message || "Upstream or Server Failure"
    })
  }
})

if (process.env.ENVIRONMENT !== 'production') {
  connectDB()
  .then(() => {
    console.log('Connected to database')
    app.listen(PORT, () => console.log(`Local server running on port ${PORT}`))
  })
  .catch((error) => {
    console.error('Database connection failed:', error.message)
  })
}

const seedData = async () => {
  try {
    await connectDB()
    await Profile.deleteMany({})
    await Profile.insertMany(json)
    console.log('Data seeded successfully')
  } catch (error) {
    console.error('Error seeding data:', error)
  }
}

seedData()


module.exports = app
