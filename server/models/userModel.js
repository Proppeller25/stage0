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

const userModel = new mongoose.Schema({
  _id:{
    type: String,
    default: uuidv7,
    unique: true
  },
  id:{
    type: String,
    default: function () {
      return this._id
    }
  },
  github_id: {
    type: String,
    unique: true
  },
  username: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  avatar_url: {
    type: String,
  },
  refresh_token: {
    type: String
  },
  refresh_token_expires_at: {
    type: Date
  },
  role: {
    type: String,
    enum: ['admin', 'analyst'],
    default: 'analyst',
    required: true
  },
  is_active: {
    type: Boolean,
    default: false
  },
  last_login_at: {
    type: Date,
    default: Date.now
  }
},
{
  timestamps: {
    createdAt: 'created_at',
    updatedAt: false
  }
}
)

module.exports = mongoose.models.User || mongoose.model('User', userModel)
