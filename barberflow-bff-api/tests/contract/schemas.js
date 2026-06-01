'use strict';

/**
 * schemas.js — Schemas JSON das respostas canônicas da BFF.
 *
 * Convenção de validação: o schema descreve a shape mínima obrigatória.
 * Campos extras são permitidos (additionalProperties: true implícito).
 */

/** Testa se um valor satisfaz o schema, retorna [] se ok, [msg] se falha. */
function validate(value, schema, path = 'root') {
  const errors = [];

  if (schema.type) {
    const actual = Array.isArray(value) ? 'array' : typeof value;
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.includes(actual) && !(types.includes('null') && value === null)) {
      errors.push(`${path}: esperado ${types.join('|')}, recebeu ${actual}`);
      return errors; // sem sentido continuar
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: ${JSON.stringify(value)} não está em [${schema.enum}]`);
  }

  if (schema.required && value != null && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required) {
      if (!(key in value)) {
        errors.push(`${path}: campo obrigatório ausente — "${key}"`);
      }
    }
  }

  if (schema.properties && value != null && typeof value === 'object') {
    for (const [key, subSchema] of Object.entries(schema.properties)) {
      if (key in value) {
        errors.push(...validate(value[key], subSchema, `${path}.${key}`));
      }
    }
  }

  if (schema.items && Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      errors.push(...validate(value[i], schema.items, `${path}[${i}]`));
    }
  }

  if (schema.minLength != null && typeof value === 'string' && value.length < schema.minLength) {
    errors.push(`${path}: length ${value.length} < minLength ${schema.minLength}`);
  }

  return errors;
}

// ─── Envelopes ──────────────────────────────────────────────────────────────

const ENVELOPE_OK = {
  type: 'object',
  required: ['ok', 'dados'],
  properties: {
    ok:    { type: 'boolean', enum: [true] },
    dados: { type: 'object' },
  },
};

const ENVELOPE_ERRO = {
  type: 'object',
  required: ['ok', 'error'],
  properties: {
    ok:    { type: 'boolean', enum: [false] },
    // `error` é string em todos os endpoints BFF canônico
    error: { type: 'string', minLength: 1 },
  },
};

const ENVELOPE_LISTA = {
  type: 'object',
  required: ['ok', 'dados'],
  properties: {
    ok:    { type: 'boolean', enum: [true] },
    dados: { type: 'array' },
  },
};

// ─── Auth ────────────────────────────────────────────────────────────────────

const AUTH_SESSION = {
  type: 'object',
  required: ['ok', 'dados'],
  properties: {
    ok: { type: 'boolean', enum: [true] },
    dados: {
      type: 'object',
      // access_token e user retornados no nível de dados
      required: ['access_token'],
      properties: {
        access_token: { type: 'string', minLength: 1 },
        user: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', minLength: 1 } },
        },
      },
    },
  },
};

// ─── Agendamento ─────────────────────────────────────────────────────────────

const AGENDAMENTO_ITEM = {
  type: 'object',
  required: ['id'],
  properties: {
    id:             { type: 'string', minLength: 1 },
    professional_id:{ type: 'string' },
    barbershop_id:  { type: 'string' },
    scheduled_at:   { type: 'string' },
  },
};

const AGENDAMENTO_LISTA = {
  type: 'object',
  required: ['ok', 'dados'],
  properties: {
    ok:    { type: 'boolean', enum: [true] },
    dados: { type: 'array', items: AGENDAMENTO_ITEM },
  },
};

const AGENDAMENTO_CRIADO = {
  type: 'object',
  required: ['ok', 'dados'],
  properties: {
    ok: { type: 'boolean', enum: [true] },
    dados: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', minLength: 1 } },
    },
  },
};

// ─── Chat ────────────────────────────────────────────────────────────────────

const CONVERSA_ITEM = {
  type: 'object',
  required: ['id'],
  properties: {
    id:          { type: 'string', minLength: 1 },
    unread_count:{ type: ['number', 'string'] },
  },
};

const MENSAGEM_ITEM = {
  type: 'object',
  required: ['id'],
  properties: {
    id:         { type: 'string', minLength: 1 },
    sender_id:  { type: 'string' },
    body:       { type: 'string' },
  },
};

// ─── Upload ──────────────────────────────────────────────────────────────────

const PRESIGNED_RESPONSE = {
  type: 'object',
  required: ['ok', 'dados'],
  properties: {
    ok: { type: 'boolean', enum: [true] },
    dados: {
      type: 'object',
      required: ['mediaId'],
      properties: {
        mediaId:   { type: 'string', minLength: 1 },
        uploadUrl: { type: 'string' },
        token:     { type: 'string' },
        expiresAt: { type: 'string' },
      },
    },
  },
};

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  validate,
  schemas: {
    ENVELOPE_OK,
    ENVELOPE_ERRO,
    ENVELOPE_LISTA,
    AUTH_SESSION,
    AGENDAMENTO_ITEM,
    AGENDAMENTO_LISTA,
    AGENDAMENTO_CRIADO,
    CONVERSA_ITEM,
    MENSAGEM_ITEM,
    PRESIGNED_RESPONSE,
  },
};
