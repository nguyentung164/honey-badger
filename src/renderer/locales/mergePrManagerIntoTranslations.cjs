const fs = require('fs')
const path = require('path')
const { en, vi, ja } = require('./prManagerLocaleData.cjs')

const locales = [
  { file: 'en/translation.json', data: en },
  { file: 'vi/translation.json', data: vi },
  { file: 'ja/translation.json', data: ja },
]

const dir = __dirname
for (const { file, data } of locales) {
  const p = path.join(dir, file)
  const j = JSON.parse(fs.readFileSync(p, 'utf8'))
  j.prManager = data
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n', 'utf8')
}
console.log('prManager merged into', locales.length, 'translation files.')
