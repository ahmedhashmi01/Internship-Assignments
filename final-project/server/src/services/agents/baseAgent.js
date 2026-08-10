import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class BaseAgent {
  constructor(providerService, promptFileName) {
    this.providerService = providerService
    this.promptFileName = promptFileName
  }

  async loadPrompt() {
    const promptPath = path.resolve(__dirname, '../../prompts', this.promptFileName)
    return fs.readFile(promptPath, 'utf8')
  }

  async run(_input, _schema) {
    throw new Error('Not implemented')
  }
}
