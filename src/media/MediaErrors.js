'use strict';

class MediaPipelineError extends Error {
  constructor(message, { status = 500, code = 'MEDIA_ERROR', cause = null, details = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    if (details) this.details = details;
  }
}

class UploadError extends MediaPipelineError {
  constructor(message, options = {}) {
    super(message, { status: options.status ?? 502, code: options.code ?? 'UPLOAD_ERROR', ...options });
  }
}

class CompressionError extends MediaPipelineError {
  constructor(message, options = {}) {
    super(message, { status: options.status ?? 422, code: options.code ?? 'COMPRESSION_ERROR', ...options });
  }
}

class ValidationError extends MediaPipelineError {
  constructor(message, options = {}) {
    super(message, { status: options.status ?? 400, code: options.code ?? 'VALIDATION_ERROR', ...options });
  }
}

class ProcessingError extends MediaPipelineError {
  constructor(message, options = {}) {
    super(message, { status: options.status ?? 422, code: options.code ?? 'PROCESSING_ERROR', ...options });
  }
}

module.exports = {
  MediaPipelineError,
  UploadError,
  CompressionError,
  ValidationError,
  ProcessingError,
};
