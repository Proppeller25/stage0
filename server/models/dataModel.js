const mongoose = require('mongoose')
const crypto = require('crypto')

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

const dataModel = new mongoose.Schema({
  id: {
    type: String,      
    default: uuidv7
  },
  name: {
    type: String,
    required: true,
    unique: true
  },
  gender: {
    type: String,
    required: true
  },
  gender_probability: {
    type: Number,
    required: true
  },
  sample_size:{
    type: Number,
    required: true
  },
  age:{
    type: Number,
    required: true
  },
  age_group:{
    type: String,
    required: true
  },
  country_id:{
    type: String,
    required: true
  },
  country_probability:{
    type: Number,
    required: true
  },
},
{
  timestamps: {
    createdAt: 'created_at',
    updatedAt: false
  }
}
)
console.log('✅ Data model loaded');
module.exports = mongoose.models.Data || mongoose.model('Data', dataModel)
