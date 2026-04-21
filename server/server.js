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
const countryMap = {}

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
      _id: {
        type: String,
        default: uuidv7,
      },
      id: {
        type: String,
        default: function () {
          return this._id
        },
        unique: true
      },
      name: {
        type: String,
        required: true,
        unique: true,
      },
      gender: {
        type: String,
        required: true,
        enum: ['male', 'female']
      },
      gender_probability: {
        type: Number,
        required: true,
      },
      sample_size: {
        type: Number,
      },
      age: {
        type: Number,
        required: true,
      },
      age_group: {
        type: String,
        required: true,
        enum: ['child', 'teenager', 'adult', 'senior']
      },
      country_id: {
        type: String,
        required: true,
        minlength: 2,
        maxlength: 2
      },
      country_name: {
        type: String,
        required: true
      },
      country_probability: {
        type: Number,
        required: true,
      },
    },
    {
      timestamps: {
        createdAt: 'created_at',
        updatedAt: false
      },
    }
  )

  dataSchema.index({ gender: 1 })
  dataSchema.index({ age_group: 1 })
  dataSchema.index({ country_id: 1 })
  dataSchema.index({ age: 1 })
  dataSchema.index({ created_at: -1 })

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

const isValidNumber = (value) => !Number.isNaN(Number(value))
const isValidProbability = (value) => isValidNumber(value) && Number(value) >= 0 && Number(value) <= 1
const isValidPositiveInteger = (value) => Number.isInteger(Number(value)) && Number(value) > 0

const formatProfile = (profile) => ({
  id: profile.id,
  name: profile.name,
  gender: profile.gender,
  gender_probability: profile.gender_probability,
  age: profile.age,
  age_group: profile.age_group,
  sample_size: profile.sample_size,
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

json.forEach(profile => {
  const name = profile.country_name?.toLowerCase()
  const id = profile.country_id
  if (name && id && !countryMap[name]) {
    countryMap[name] = id
  }
})

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
      sample_size: genderData.count,
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



app.get('/api/profiles', async (req, res) => {
  try{
    await connectDB()
    res.setHeader('Access-Control-Allow-Origin', '*')
    const {gender, country_id, age_group, min_age, max_age, min_gender_probability, min_country_probability, sort_by = 'created_at', order, page = 1, limit = 10} = req.query
    const filters = {}
    let sortOrder
    let sortQuery
    let skip
    const maxPageLimit = 50
    let maxLimit = Number(limit) > maxPageLimit ? maxPageLimit : Number(limit)
    const sortingOptions = ['created_at', 'age', 'gender_probability']
    const orderOptions = ['asc', 'desc']
    const genderOptions = ['male', 'female']
    const ageGroupOptions = ['child', 'teenager', 'adult', 'senior']

    if (!isValidPositiveInteger(page) || !isValidPositiveInteger(limit))
      return res.status(422).json({status: "error", message: "Invalid query parameters"})

    if (gender && !genderOptions.includes(gender.trim().toLowerCase()))
      return res.status(422).json({status: "error", message: "Invalid query parameters"})

    if (age_group && !ageGroupOptions.includes(age_group.trim().toLowerCase()))
      return res.status(422).json({status: "error", message: "Invalid query parameters"})

    if (country_id && !/^[A-Za-z]{2}$/.test(country_id.trim()))
      return res.status(422).json({status: "error", message: "Invalid query parameters"})

    if ((min_age && !isValidNumber(min_age)) || (max_age && !isValidNumber(max_age)))
      return res.status(422).json({status: "error", message: "Invalid query parameters"})

    if ((min_gender_probability && !isValidProbability(min_gender_probability)) || (min_country_probability && !isValidProbability(min_country_probability)))
      return res.status(422).json({status: "error", message: "Invalid query parameters"})

    if (min_age && max_age && Number(min_age) > Number(max_age))
      return res.status(422).json({status: "error", message: "Invalid query parameters"})

    if (gender) {
      filters.gender = gender.trim().toLowerCase()
    }
    if (country_id) {
      filters.country_id = country_id.trim().toUpperCase()
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
      if (!sortingOptions.includes(sort_by)) return res.status(422).json({status: "error", message: "Invalid query parameters"})
      if (order && !orderOptions.includes(order)) return res.status(422).json({status: "error", message: "Invalid query parameters"})

      sortOrder = order === 'desc' ? -1 : 1
      sortQuery = { [sort_by]: sortOrder }
    }
    if (page) {
      const pageNumber = Number(page)
      skip = (pageNumber - 1) * maxLimit
    }
    
    const foundData = await Profile.find(filters).sort(sortQuery).skip(skip || 0).limit(maxLimit || 10)
    const total = await Profile.countDocuments(filters)

    res.status(200).json({
      status: "success",
      page: Number(page) || 1,
      limit: maxLimit || 10,
      total,
      data: foundData.map(formatProfile)
    })

  } catch(error) {
    return res.status(500).json({
      status: "error",
      message: error.message || "Upstream or Server Failure"
    })
  }
})

app.get('/api/profiles/search', async (req, res) => {
  try {
    await connectDB()
    res.setHeader('Access-Control-Allow-Origin', '*')
    const {q, page = 1, limit = 10 } = req.query
    let skip
    const maxPageLimit = 50
    let maxLimit = Number(limit) > maxPageLimit ? maxPageLimit : Number(limit)

    if (!q || q.trim().length === 0) return res.status(400).json({ status: "error", message: "Missing or empty search query" })
    if(typeof q !== "string") return res.status(422).json({ status: "error", message: "Invalid query parameters" })
    if (!isValidPositiveInteger(page) || !isValidPositiveInteger(limit)) return res.status(422).json({ status: "error", message: "Invalid query parameters" })

    const words = q.toLowerCase().split(/\s+/)
    const aboveMatch = q.match(/above (\d+)/)

    if (q.toLowerCase().includes('above') && !aboveMatch) return res.status(422).json({ status: "error", message: "Invalid query parameters" })

    let hasMale = false
    let hasFemale = false

    const ageGroupMap = {
      child: 'child',
      teenager: 'teenager',
      teenagers: 'teenager',
      teens: 'teenager',
      adult: 'adult',
      senior: 'senior'
    }
    const genderMap = {
      male: 'male',
      males: 'male',
      boy: 'male',
      boys: 'male',
      female: 'female',
      females: 'female',
      girl: 'female',
      girls: 'female'
    }

    const ageRangeMap = {
      child: { min: 0, max: 12 },
      teenager: { min: 13, max: 19 },
      adult: { min: 20, max: 59 },
      senior: { min: 60, max: 120 },
      young: {min: 16, max: 24}
    }

    const filters = {}
    let minAge = null;
    let maxAge = null;
    let hasAnyFilter = false

/// loop for search query words and build filters based on matches with
    for (const word of words) {
      if (genderMap[word]) {
        if(genderMap[word] === 'male') hasMale = true
        if(genderMap[word] === 'female') hasFemale = true
      }

      if(ageGroupMap[word]) {
        filters.age_group = ageGroupMap[word]
        hasAnyFilter = true
      }

      if(countryMap[word]) {
        filters.country_id = countryMap[word]
        hasAnyFilter = true
      }

      if(ageRangeMap[word]){
        const {min, max} = ageRangeMap[word]
        minAge = min
        maxAge = max
        hasAnyFilter = true
      }
    }

    const fromMatch = q.toLowerCase().match(/from\s+([a-z ]+)/)
    if (fromMatch) {
      const countryName = fromMatch[1].trim()
      if (countryMap[countryName]) {
        filters.country_id = countryMap[countryName]
        hasAnyFilter = true
      }
    }

    if(hasFemale && hasMale) {
      filters.gender = { $in: ['male', 'female'] }
      hasAnyFilter = true
    }
    else if(hasMale) {
      filters.gender =  'male'
      hasAnyFilter = true
    }
    else if(hasFemale) {
      filters.gender = 'female'
      hasAnyFilter = true
    }

    if (minAge !== null || maxAge !== null) {
      filters.age = {};
      if (minAge !== null) filters.age.$gte = minAge;
      if (maxAge !== null) filters.age.$lte = maxAge;
    }

    if(aboveMatch) {
      const age = Number(aboveMatch[1])
      minAge = minAge !== null ? Math.max(minAge, age) : age
      filters.age = filters.age || {}
      filters.age.$gte = minAge
      hasAnyFilter = true
    }

    if(!hasAnyFilter) 
      return res.status(400).json({ status: "error", message: "Unable to interpret query" })

    
    if (page) {
      const pageNumber = Number(page)
      skip = (pageNumber - 1) * maxLimit
    }

    const foundData = await Profile.find(filters).skip(skip || 0).limit(maxLimit || 0)
    const total = hasAnyFilter ? await Profile.countDocuments(filters) : foundData.length

    res.status(200).json({
      status: "success",
      page: Number(page) || 1,
      limit: maxLimit > total ? total : maxLimit || 10,
      total,
      data: foundData.map(formatProfile)
    })

  } catch (error){
    return res.status(500).json({
      status: "error",
      message: error.message || "Upstream or Server Failure"
    })
  }
})

app.get('/api/profiles/:id', async (req, res) => {
  try{
    const {id} = req.params
    await connectDB()
    res.setHeader('Access-Control-Allow-Origin', '*')

    const foundData = await Profile.findOne({ id })

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

app.delete('/api/profiles/:id', async (req, res) => {
  try{
    const {id} = req.params
    res.setHeader('Access-Control-Allow-Origin', '*')
    await connectDB()

    const deletedData = await Profile.findOneAndDelete({ id }) 

    if(!deletedData) return res.status(404).json({status: "error", message: "Profile not found"})

    return res.status(204).send()

  } catch(error) {
    return res.status(500).json({
      status: "error",
      message: error.message || "Upstream or Server Failure"
    })
  }
})

if (require.main === module && process.env.ENVIRONMENT !== 'production') {
  connectDB()
  .then(() => {
    console.log('Connected to database')
    app.listen(PORT, () => console.log(`Local server running on port ${PORT}`))
  }).then(() => {
    seedData()
  })
  .catch((error) => {
    console.error('Database connection failed:', error.message)
  })
}

const seedData = async () => {
  await connectDB()

  const allNames = json.map(profile => profile.name.trim().toLowerCase())
  const existingProfiles = await Profile.find({ name: { $in: allNames } }).select('name')
  const existingNames = existingProfiles.map(profile => profile.name)
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

app.seedData = seedData


module.exports = app
