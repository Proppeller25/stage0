const fs = require('fs')
const path = require('path')

const CONFIG_DIR = path.join(process.env.HOME || process.env.USERPROFILE, '.insighta')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

// Default API URL - can be overridden via environment or config
const DEFAULT_API_URL = 'http://localhost:3000/api'

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

function loadConfig() {
  ensureConfigDir()
  if (!fs.existsSync(CONFIG_FILE)) {
    return {}
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function saveConfig(config) {
  ensureConfigDir()
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
}

function getApiUrl() {
  const config = loadConfig()
  return config.apiUrl || DEFAULT_API_URL
}

function setApiUrl(url) {
  const config = loadConfig()
  config.apiUrl = url
  saveConfig(config)
}

function getAuth() {
  const config = loadConfig()
  return config.auth || null
}

function setAuth(auth) {
  const config = loadConfig()
  config.auth = auth
  saveConfig(config)
}

function clearAuth() {
  const config = loadConfig()
  delete config.auth
  saveConfig(config)
}

module.exports = { getAuth, setAuth, clearAuth, getApiUrl, setApiUrl, DEFAULT_API_URL }