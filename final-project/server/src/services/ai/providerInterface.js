export class BaseProvider {
  constructor(config) {
    this.config = config
  }

  async generateText(_prompt) {
    throw new Error('Not implemented')
  }

  async generateJson(_prompt, _schema) {
    throw new Error('Not implemented')
  }

  async healthCheck() {
    return { ok: true, provider: this.constructor.name }
  }
}
