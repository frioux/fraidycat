let storage = null

if (process.env.STORAGE === 'mock') {
  storage = require('./mock/storage')
} else {
  storage = require('./webext/storage')
}

console.log(`STORAGE = ${process.env.STORAGE}`)
module.exports = storage
