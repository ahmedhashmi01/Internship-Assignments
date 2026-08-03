export const errorHandler = (error, _req, res, _next) => {
  console.error('Request processing failed')
  res.status(500).json({ message: error.message || 'Unexpected error' })
}
