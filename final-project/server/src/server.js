import cors from 'cors'
import express from 'express'
import { pathToFileURL } from 'url'
import { config as defaultConfig } from './config.js'
import { createAnalysisRouter } from './routes/analysisRoutes.js'
import { createResumeRouter } from './routes/resumeRoutes.js'
import { errorHandler } from './middleware/errorHandler.js'
import { createAiService } from './services/ai/providerService.js'

export const createApp = (configOverrides = {}) => {
  const app = express()
  const resolvedConfig = { ...defaultConfig, ...configOverrides }

  app.use(cors({ origin: resolvedConfig.clientOrigin }))
  app.use(express.json())

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'resume-job-match-analyzer-api',
      provider: resolvedConfig.aiProvider,
      model: resolvedConfig.ollamaModel,
    })
  })

  app.get('/api/ai/health', async (_req, res) => {
    try {
      const aiService = createAiService(resolvedConfig)
      const response = await aiService.generateText('health-check')
      res.json({ status: 'ok', provider: resolvedConfig.aiProvider, model: resolvedConfig.ollamaModel, sampleResponse: response.slice(0, 40) })
    } catch (error) {
      res.status(503).json({ status: 'error', provider: resolvedConfig.aiProvider, message: error.message })
    }
  })

  app.use('/api/analysis', createAnalysisRouter(resolvedConfig))
  app.use('/api/resume', createResumeRouter(resolvedConfig))
  app.use(errorHandler)

  return app
}

export const startServer = (configOverrides = {}) => {
  const app = createApp(configOverrides)
  const port = configOverrides.port || defaultConfig.port

  return app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`)
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer()
}
