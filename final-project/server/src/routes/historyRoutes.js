import express from 'express'

// All history endpoints require auth and derive the owner exclusively from the
// token (req.auth.userId). A userId in the request body/query is never trusted,
// so one user can never read or delete another user's records.
export const createHistoryRouter = ({ historyService, authMiddleware }) => {
  const router = express.Router()

  router.use(authMiddleware.requireAuth)

  router.get('/', async (req, res, next) => {
    try {
      const records = await historyService.listForUser(req.auth.userId)
      return res.json({ history: records })
    } catch (error) {
      next(error)
    }
  })

  router.get('/:id', async (req, res, next) => {
    try {
      const record = await historyService.getOwned(req.params.id, req.auth.userId)
      return res.json({ record })
    } catch (error) {
      next(error)
    }
  })

  router.delete('/:id', async (req, res, next) => {
    try {
      await historyService.deleteOwned(req.params.id, req.auth.userId)
      return res.json({ success: true })
    } catch (error) {
      next(error)
    }
  })

  return router
}
