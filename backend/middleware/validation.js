// backend/middleware/validation.js
const Joi = require('joi');
const { z } = require('zod');
const { formatIssues } = require('../schemas/common.schema');

function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        details: error.details.map((d) => d.message),
      });
    }
    req.body = value;
    next();
  };
}

// --- Strict zod request validation -----------------------------------------
// Every request validation below is strict: unknown keys are rejected with a
// 400 instead of being silently stripped, so a controller can never hand a
// mass-assignment payload (`role`, `status`, `assignedUserId`, ...) to a service.

// Shape a zod failure into the same { success, message, details } error body
function validationErrorResponse(res, error) {
  return res.status(400).json({
    success: false,
    message: 'Validation error',
    details: formatIssues(error.issues),
  });
}

// Validate and replace req.body. The parsed value (with defaults and
// normalisation applied) is what the controller reads, never the raw body.
function validateBody(schema) {
  return (req, res, next) => {
    const { success, data, error } = schema.safeParse(req.body ?? {});
    if (!success) return validationErrorResponse(res, error);
    req.body = data;
    next();
  };
}

// Validate and replace req.query, so services only ever see allowlisted filters.
function validateQuery(schema) {
  return (req, res, next) => {
    const { success, data, error } = schema.safeParse(req.query ?? {});
    if (!success) return validationErrorResponse(res, error);
    req.query = data;
    next();
  };
}

// Validate and replace req.params, so path ids are well-formed before any
// service or Prisma call sees them.
function validateParams(schema) {
  return (req, res, next) => {
    const { success, data, error } = schema.safeParse(req.params ?? {});
    if (!success) return validationErrorResponse(res, error);
    req.params = data;
    next();
  };
}

// Validate the optional Idempotency-Key header. A malformed key is rejected so
// an idempotent caller never silently loses its protection.
function validateIdempotencyKey(schema) {
  return (req, res, next) => {
    const header = req.get ? req.get('Idempotency-Key') : undefined;
    const { success, data, error } = schema.safeParse(header);
    if (!success) return validationErrorResponse(res, error);
    req.idempotencyKey = data;
    next();
  };
}



const registrationSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  username: Joi.string().trim().min(3).max(30).required(),
  password: Joi.string().min(8).required(),
  firstName: Joi.string().trim().max(50).allow("", null).optional(),
  lastName: Joi.string().trim().max(50).allow("", null).optional(),
});

const loginSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  password: Joi.string().required(),
});

const updatePasswordSchema = Joi.object({
  oldPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).required(),
});

const updateProfileSchema = Joi.object({
  username: Joi.string().trim().min(3).max(30).required(),
  firstName: Joi.string().trim().max(50).allow(""),
  lastName: Joi.string().trim().max(50).allow(""),
});

module.exports = {
  validate,
  validateBody,
  validateQuery,
  validateParams,
  validateIdempotencyKey,
  validationErrorResponse,
  z,
  validateRegistration: validate(registrationSchema),
  validateLogin: validate(loginSchema),
  validateUpdatePassword: validate(updatePasswordSchema),
  validateUpdateProfile: validate(updateProfileSchema),
};
