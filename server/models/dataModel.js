const mongoose = require('mongoose')
const { v7: uuidv7 } = require('uuid')

const dataModel = new mongoose.Schema({
  _id: {
    type: String,      
    default: uuidv7,
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
  timestamps: true
}
)
console.log('✅ Data model loaded');
module.exports = mongoose.model('Data', dataModel)
