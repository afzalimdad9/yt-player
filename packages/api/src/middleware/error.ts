import { FastifyError, FastifyRequest, FastifyReply } from 'fastify'
import { ZodError } from 'zod'

export function errorHandler(
  error: FastifyError | Error,
  _request: FastifyRequest,
  reply: FastifyReply
) {
  const requestId = _request.id

  // Zod validation errors
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: 'Validation Error',
      message: 'Invalid request data',
      details: error.errors,
      requestId,
    })
  }

  // Fastify built-in errors
  const fastifyError = error as FastifyError
  const statusCode = fastifyError.statusCode || 500

  // Known errors
  if (statusCode < 500) {
    return reply.status(statusCode).send({
      error: fastifyError.code || 'Error',
      message: error.message,
      requestId,
    })
  }

  // Internal server errors
  console.error(`[Error] ${requestId}:`, error)
  return reply.status(500).send({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
    requestId,
  })
}
