const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
const app = express()
const PORT = process.env.PORT || 3000
require('dotenv').config()
const importedDataModel = require('./models/dataModel')
let connectionPromise = null

const createDataModel = () => {
  const dataSchema = new mongoose.Schema(
    {
      _id: {
        type: String,
        default: () => crypto.randomUUID(),
      },
      name: {
        type: String,
        required: true,
        unique: true,
      },
      gender: {
        type: String,
        required: true,
      },
      gender_probability: {
        type: Number,
        required: true,
      },
      sample_size: {
        type: Number,
        required: true,
      },
      age: {
        type: Number,
        required: true,
      },
      age_group: {
        type: String,
        required: true,
      },
      country_id: {
        type: String,
        required: true,
      },
      country_probability: {
        type: Number,
        required: true,
      },
    },
    {
      timestamps: true,
    }
  )

  return mongoose.models.Data || mongoose.model('Data', dataSchema)
}

const Data = typeof importedDataModel?.findOne === 'function'
  ? importedDataModel
  : createDataModel()

app.use(cors())

cors({
  accessControlAllowOrigin: '*',
})



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
////////
app.get('/', (req, res) => {
  res.json({ message: 'Hello from the server!' })
})

app.get('/api/debug-model', async (req, res) => {
  try {
    res.status(200).json({
      status: 'success',
      debug: {
        dataType: typeof Data,
        modelName: Data?.modelName || null,
        hasFindOne: typeof Data?.findOne,
        hasCreate: typeof Data?.create,
        keys: Object.getOwnPropertyNames(Data || {}).slice(0, 20),
        mongooseReadyState: mongoose.connection.readyState,
        environment: process.env.ENVIRONMENT || null
      }
    })
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    })
  }
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

app.post('/api/profiles', async(req, res) => {
  try{
    const {name} = req.body

    await connectDB()
    
    if (!name || name.trim().length === 0 || name === "''") 
      return res.status(400).json({ status: "error", message: "Missing or empty name parameter" })

    if (typeof name !== "string")
      return res.status(422).json({ status: "error", message: "Name is not a string" })

    const genderData = await (await fetch(`https://api.genderize.io?name=${encodeURIComponent(name)}`)).json()
    const ageData = await (await fetch(`https://api.agify.io?name=${encodeURIComponent(name)}`)).json()
    const countryData = await (await fetch(`https://api.nationalize.io?name=${encodeURIComponent(name)}`)).json()

    if(!genderData || !ageData || !countryData) return res.status(502).json({status: "error", message: "external API returned an error"})
    

    if (!genderData.gender || !genderData.count) 
      return res.json({ status: "error", message: "No gender prediction available for the provided name" })
    
    if (!ageData.age) 
      return res.json({ status: "error", message: "No age prediction available for the provided name" })

    if (!countryData.country || countryData.country.length === 0) 
      return res.json({ status: "error", message: "No country data available for the provided name" })

    const highestProbabilityCountry = getHighestProbability(countryData.country)

    const compiledData = {
      name,
      gender:genderData.gender,
      gender_probability: genderData.probability,
      sample_size:genderData.count,
      age:ageData.age,
      age_group: classifyAge(ageData.age),
      country_id: highestProbabilityCountry.country_id,
      country_probability: highestProbabilityCountry.probability.toFixed(4)
    }
    
    if (typeof Data?.findOne !== 'function') {
      return res.status(500).json({
        status: "error",
        message: "Data.findOne is not a function",
        debug: {
          dataType: typeof Data,
          modelName: Data?.modelName || null,
          hasFindOne: typeof Data?.findOne,
          hasCreate: typeof Data?.create,
          keys: Object.getOwnPropertyNames(Data || {}).slice(0, 20),
          mongooseReadyState: mongoose.connection.readyState,
          environment: process.env.ENVIRONMENT || null
        }
      })
    }

    const existingData = await Data.findOne({name})
    
    if(existingData)
      return res.json({status:"success", message:"Profile already exists", data: existingData}) 

    const savedData = new Data (compiledData)

    await savedData.save()
    
    
    res.status(201).json({
      status: "success",
      data: savedData
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

    const foundData = await Data.findById(id)
    
    if (!id) return res.status(400).json({status: "error", message: "Id is required"})

    if(!foundData) return res.status(404).json({status: "error", message: "No record found for this Id"})

    res.status(200).json({
      status: "success",
      data: foundData
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
    const {gender, country, country_id} = req.query
    let foundData 
    if (gender || country || country_id) foundData = await Data.find({gender, country, country_id})
    else foundData = await Data.find()
    

    if(!foundData) return res.status(404).json({status: "error", message: "No record found for this Id"})

    res.status(200).json({
      status: "success",
      data: foundData
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

    const deletedData = await Data.findByIdAndDelete(id) 

    if(!deletedData) return res.status(404).json({status: "error", message: "No record found for this Id"})

    res.status(204).json({
      status: "success"
    })

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


module.exports = app
